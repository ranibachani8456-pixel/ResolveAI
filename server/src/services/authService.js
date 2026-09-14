import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { assertJwtConfiguration, signJwt } from "../utils/jwt.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class AuthServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
  }
}

export class AuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthServiceError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizeEmail(value) {
  const email = requireString(value, "email").toLowerCase();

  if (email.length > 191 || !EMAIL_PATTERN.test(email)) {
    throw new AuthServiceError(400, "A valid email is required");
  }

  return email;
}

function normalizeOrganizationSlug(value) {
  const slug = requireString(value, "organizationSlug").toLowerCase();

  if (slug.length > 191 || !SLUG_PATTERN.test(slug)) {
    throw new AuthServiceError(
      400,
      "organizationSlug must contain lowercase letters, numbers, and single hyphens only",
    );
  }

  return slug;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw new AuthServiceError(
      400,
      `password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    );
  }

  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    throw new AuthServiceError(400, "password is too long");
  }

  return value;
}

function validateBcryptConfiguration() {
  if (!Number.isInteger(env.bcryptRounds) || env.bcryptRounds < 4 || env.bcryptRounds > 15) {
    throw new AuthConfigurationError("BCRYPT_ROUNDS must be an integer between 4 and 15");
  }
}

function validateRegistrationInput(input) {
  const organizationName = requireString(input?.organizationName, "organizationName");
  const name = requireString(input?.name, "name");

  if (organizationName.length > 191 || name.length > 191) {
    throw new AuthServiceError(400, "Name fields must not exceed 191 characters");
  }

  return {
    organizationName,
    organizationSlug: normalizeOrganizationSlug(input?.organizationSlug),
    name,
    email: normalizeEmail(input?.email),
    password: validatePassword(input?.password),
  };
}

function validateLoginInput(input) {
  if (typeof input?.password !== "string" || !input.password) {
    throw new AuthServiceError(400, "password is required");
  }

  return {
    organizationSlug: normalizeOrganizationSlug(input?.organizationSlug),
    email: normalizeEmail(input?.email),
    password: input.password,
  };
}

function assertAuthenticationConfiguration() {
  assertJwtConfiguration();
  validateBcryptConfiguration();
}

function createIdentity(user) {
  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  };
}

export async function register(input) {
  const data = validateRegistrationInput(input);
  assertAuthenticationConfiguration();

  const existingOrganization = await prisma.organization.findUnique({
    where: { slug: data.organizationSlug },
    select: { id: true },
  });

  if (existingOrganization) {
    throw new AuthServiceError(409, "Organization slug is already registered");
  }

  const passwordHash = await bcrypt.hash(data.password, env.bcryptRounds);

  try {
    return await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          name: data.organizationName,
          slug: data.organizationSlug,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      });

      const user = await transaction.user.create({
        data: {
          organizationId: organization.id,
          name: data.name,
          email: data.email,
          passwordHash,
          role: "OWNER",
        },
        select: {
          id: true,
          organizationId: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      // Signing inside the transaction prevents account creation if token creation fails.
      const token = signJwt(createIdentity(user));

      return { token, organization, user };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthServiceError(409, "Organization slug is already registered");
    }

    throw error;
  }
}

export async function login(input) {
  const data = validateLoginInput(input);
  assertAuthenticationConfiguration();

  const organization = await prisma.organization.findUnique({
    where: { slug: data.organizationSlug },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) {
    throw new AuthServiceError(401, "Invalid organization, email, or password");
  }

  const user = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: data.email,
      },
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
    },
  });

  const passwordMatches = user
    ? await bcrypt.compare(data.password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    throw new AuthServiceError(401, "Invalid organization, email, or password");
  }

  const safeUser = {
    id: user.id,
    organizationId: user.organizationId,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return {
    token: signJwt(createIdentity(user)),
    organization,
    user: safeUser,
  };
}

export async function getCurrentUser({ userId, organizationId }) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!user) {
    throw new AuthServiceError(401, "Authentication required");
  }

  return user;
}

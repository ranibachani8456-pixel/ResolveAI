import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { assertJwtConfiguration, signJwt } from "../utils/jwt.js";
import {
  GoogleCredentialError,
  GoogleIdentityConfigurationError,
  verifyGoogleCredential,
} from "./googleIdentityService.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Comparing against a real-cost hash makes missing-account login work less distinguishable.
const DUMMY_PASSWORD_HASH = "$2b$12$H6dNoYsI5NEgKlYhrymbFuOF0fiejcu7qlXGuqaJqHi7k.v315XFO";

export class AuthServiceError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
    this.code = code;
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

function assertExactFields(input, allowedFields) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AuthServiceError(400, "Request body must be an object");
  }
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    throw new AuthServiceError(400, "Request contains unsupported fields");
  }
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
  assertExactFields(input, new Set([
    "organizationName", "organizationSlug", "name", "email", "password",
  ]));
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
  assertExactFields(input, new Set(["organizationSlug", "email", "password"]));
  if (typeof input?.password !== "string" || !input.password) {
    throw new AuthServiceError(400, "password is required");
  }

  return {
    organizationSlug: normalizeOrganizationSlug(input?.organizationSlug),
    email: normalizeEmail(input?.email),
    password: input.password,
  };
}

function validateGoogleLoginInput(input) {
  assertExactFields(input, new Set(["credential"]));
  const credential = requireString(input.credential, "credential");
  if (credential.length > 16_384) {
    throw new AuthServiceError(400, "credential is invalid");
  }
  return credential;
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

const googleUserSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  role: true,
  organization: {
    select: { id: true, name: true, slug: true },
  },
};

function createSession(user) {
  return {
    token: signJwt(createIdentity(user)),
    organization: user.organization,
    user: {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

function unlinkedGoogleAccount() {
  return new AuthServiceError(
    403,
    "No ResolveAI account is linked to this Google account",
    "GOOGLE_ACCOUNT_NOT_LINKED",
  );
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

  const user = organization
    ? await prisma.user.findUnique({
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
    })
    : null;

  const passwordMatches = await bcrypt.compare(
    data.password,
    user?.passwordHash || DUMMY_PASSWORD_HASH,
  );

  if (!organization || !user || !passwordMatches) {
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

export async function loginWithGoogle(input, dependencies = {}) {
  const credential = validateGoogleLoginInput(input);
  assertJwtConfiguration();

  let verifiedIdentity;
  try {
    verifiedIdentity = await (dependencies.verifyGoogleCredential ?? verifyGoogleCredential)(credential);
  } catch (error) {
    if (error instanceof GoogleIdentityConfigurationError) throw error;
    if (error instanceof GoogleCredentialError) {
      throw new AuthServiceError(401, "Google authentication failed", "GOOGLE_CREDENTIAL_INVALID");
    }
    // Injected/provider boundaries must never leak their raw failure details.
    throw new AuthServiceError(401, "Google authentication failed", "GOOGLE_CREDENTIAL_INVALID");
  }

  let email;
  try {
    email = normalizeEmail(verifiedIdentity.email);
  } catch {
    throw new AuthServiceError(401, "Google authentication failed", "GOOGLE_CREDENTIAL_INVALID");
  }
  const providerSubject = verifiedIdentity.providerSubject;
  if (typeof providerSubject !== "string" || !providerSubject || providerSubject.length > 191) {
    throw new AuthServiceError(401, "Google authentication failed", "GOOGLE_CREDENTIAL_INVALID");
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const linkedIdentity = await transaction.authIdentity.findUnique({
        where: {
          provider_providerSubject: { provider: "GOOGLE", providerSubject },
        },
        select: { user: { select: googleUserSelect } },
      });
      if (linkedIdentity) return createSession(linkedIdentity.user);

      // Email is used only for a guarded first-time link. The durable identity is Google sub.
      const candidates = await transaction.user.findMany({
        where: { email },
        select: { id: true },
        take: 2,
      });
      if (candidates.length !== 1) throw unlinkedGoogleAccount();

      const existingGoogleIdentity = await transaction.authIdentity.findUnique({
        where: { userId_provider: { userId: candidates[0].id, provider: "GOOGLE" } },
        select: { id: true },
      });
      if (existingGoogleIdentity) throw unlinkedGoogleAccount();

      await transaction.authIdentity.create({
        data: {
          userId: candidates[0].id,
          provider: "GOOGLE",
          providerSubject,
        },
        select: { id: true },
      });
      const user = await transaction.user.findUnique({
        where: { id: candidates[0].id },
        select: googleUserSelect,
      });
      if (!user) throw unlinkedGoogleAccount();
      return createSession(user);
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthServiceError(
        409,
        "Google account could not be linked safely. Please try again or contact your administrator.",
        "GOOGLE_ACCOUNT_LINK_CONFLICT",
      );
    }
    throw error;
  }
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

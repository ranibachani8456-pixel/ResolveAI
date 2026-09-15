import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CREATABLE_MEMBER_ROLES = new Set([Role.ADMIN, Role.SUPPORT_AGENT, Role.VIEWER]);
const VALID_ROLES = new Set(Object.values(Role));

export class OrganizationServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "OrganizationServiceError";
    this.statusCode = statusCode;
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new OrganizationServiceError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function normalizeEmail(value) {
  const email = requireString(value, "email").toLowerCase();

  if (email.length > 191 || !EMAIL_PATTERN.test(email)) {
    throw new OrganizationServiceError(400, "A valid email is required");
  }

  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw new OrganizationServiceError(
      400,
      `password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    );
  }

  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    throw new OrganizationServiceError(400, "password is too long");
  }

  return value;
}

function normalizeRole(value) {
  const role = requireString(value, "role").toUpperCase();

  if (!VALID_ROLES.has(role)) {
    throw new OrganizationServiceError(400, "Invalid user role");
  }

  return role;
}

function validateBcryptConfiguration() {
  if (!Number.isInteger(env.bcryptRounds) || env.bcryptRounds < 4 || env.bcryptRounds > 15) {
    throw new Error("BCRYPT_ROUNDS must be an integer between 4 and 15");
  }
}

function parseUserId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new OrganizationServiceError(400, "userId must be a positive integer");
  }

  const userId = Number(value);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new OrganizationServiceError(400, "userId must be a positive integer");
  }

  return userId;
}

const safeUserSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

export async function getOrganization(organizationId) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!organization) {
    throw new OrganizationServiceError(404, "Organization not found");
  }

  return organization;
}

export async function listOrganizationUsers(organizationId) {
  return prisma.user.findMany({
    where: { organizationId },
    select: safeUserSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function createOrganizationUser(organizationId, input) {
  const name = requireString(input?.name, "name");
  const email = normalizeEmail(input?.email);
  const password = validatePassword(input?.password);
  const role = normalizeRole(input?.role);

  if (name.length > 191) {
    throw new OrganizationServiceError(400, "name must not exceed 191 characters");
  }

  if (!CREATABLE_MEMBER_ROLES.has(role)) {
    throw new OrganizationServiceError(
      400,
      "OWNER users can only be created during organization registration",
    );
  }

  validateBcryptConfiguration();

  const existingUser = await prisma.user.findUnique({
    where: {
      organizationId_email: { organizationId, email },
    },
    select: { id: true },
  });

  if (existingUser) {
    throw new OrganizationServiceError(409, "A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  try {
    return await prisma.user.create({
      data: {
        organizationId,
        name,
        email,
        passwordHash,
        role,
      },
      select: safeUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new OrganizationServiceError(409, "A user with this email already exists");
      }

      if (error.code === "P2003") {
        throw new OrganizationServiceError(404, "Organization not found");
      }
    }

    throw error;
  }
}

export async function updateOrganizationUserRole(organizationId, rawUserId, input) {
  const userId = parseUserId(rawUserId);
  const role = normalizeRole(input?.role);

  try {
    return await prisma.$transaction(async (transaction) => {
      // Lock this tenant's current OWNER rows so concurrent demotions cannot remove every OWNER.
      const owners = await transaction.$queryRaw`
        SELECT id
        FROM \`User\`
        WHERE organizationId = ${organizationId} AND role = 'OWNER'
        FOR UPDATE
      `;

      const targetUser = await transaction.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true, role: true },
      });

      if (!targetUser) {
        throw new OrganizationServiceError(404, "User not found");
      }

      if (targetUser.role === Role.OWNER && role !== Role.OWNER && owners.length <= 1) {
        throw new OrganizationServiceError(409, "The organization's only OWNER cannot be demoted");
      }

      return transaction.user.update({
        where: { id: userId, organizationId },
        data: { role },
        select: safeUserSelect,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new OrganizationServiceError(404, "User not found");
    }

    throw error;
  }
}

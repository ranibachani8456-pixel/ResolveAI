import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CustomerServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "CustomerServiceError";
    this.statusCode = statusCode;
  }
}

function parseCustomerId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new CustomerServiceError(400, "customerId must be a positive integer");
  }

  const customerId = Number(value);

  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    throw new CustomerServiceError(400, "customerId must be a positive integer");
  }

  return customerId;
}

function validateName(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomerServiceError(400, "name is required");
  }

  const name = value.trim();

  if (name.length > 191) {
    throw new CustomerServiceError(400, "name must not exceed 191 characters");
  }

  return name;
}

function normalizeEmail(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomerServiceError(400, "email is required");
  }

  const email = value.trim().toLowerCase();

  if (email.length > 191 || !EMAIL_PATTERN.test(email)) {
    throw new CustomerServiceError(400, "A valid email is required");
  }

  return email;
}

const safeCustomerSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
};

export async function listCustomers(organizationId) {
  return prisma.customer.findMany({
    where: { organizationId },
    select: safeCustomerSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function getCustomer(organizationId, rawCustomerId) {
  const customerId = parseCustomerId(rawCustomerId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: safeCustomerSelect,
  });

  if (!customer) {
    throw new CustomerServiceError(404, "Customer not found");
  }

  return customer;
}

export async function createCustomer(organizationId, input) {
  const name = validateName(input?.name);
  const email = normalizeEmail(input?.email);

  const existingCustomer = await prisma.customer.findUnique({
    where: {
      organizationId_email: { organizationId, email },
    },
    select: { id: true },
  });

  if (existingCustomer) {
    throw new CustomerServiceError(409, "A customer with this email already exists");
  }

  try {
    return await prisma.customer.create({
      data: { organizationId, name, email },
      select: safeCustomerSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new CustomerServiceError(409, "A customer with this email already exists");
      }

      if (error.code === "P2003") {
        throw new CustomerServiceError(404, "Organization not found");
      }
    }

    throw error;
  }
}

export async function updateCustomer(organizationId, rawCustomerId, input) {
  const customerId = parseCustomerId(rawCustomerId);
  const data = {};

  if (Object.hasOwn(input ?? {}, "name")) {
    data.name = validateName(input.name);
  }

  if (Object.hasOwn(input ?? {}, "email")) {
    data.email = normalizeEmail(input.email);
  }

  if (!Object.keys(data).length) {
    throw new CustomerServiceError(400, "Provide name or email to update");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });

  if (!customer) {
    throw new CustomerServiceError(404, "Customer not found");
  }

  try {
    return await prisma.customer.update({
      where: { id: customerId, organizationId },
      data,
      select: safeCustomerSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new CustomerServiceError(409, "A customer with this email already exists");
      }

      if (error.code === "P2025") {
        throw new CustomerServiceError(404, "Customer not found");
      }
    }

    throw error;
  }
}

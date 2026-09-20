import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import prisma from "../config/prisma.js";

const VALID_PRIORITIES = new Set(Object.values(TicketPriority));
const VALID_STATUSES = new Set(Object.values(TicketStatus));

export class TicketServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "TicketServiceError";
    this.statusCode = statusCode;
  }
}

function parsePositiveInteger(value, fieldName) {
  const isIntegerNumber = typeof value === "number" && Number.isSafeInteger(value);
  const isIntegerString = typeof value === "string" && /^\d+$/.test(value);

  if (!isIntegerNumber && !isIntegerString) {
    throw new TicketServiceError(400, `${fieldName} must be a positive integer`);
  }

  const parsedValue = Number(value);

  //oversized ticket bug error fixed
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0 || parsedValue > 2_147_483_647) {
    throw new TicketServiceError(400, `${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

function requireTrimmedString(value, fieldName, maximumLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TicketServiceError(400, `${fieldName} is required`);
  }

  const normalizedValue = value.trim();

  if (maximumLength && normalizedValue.length > maximumLength) {
    throw new TicketServiceError(
      400,
      `${fieldName} must not exceed ${maximumLength} characters`,
    );
  }

  return normalizedValue;
}

function validateDescription(value) {
  const description = requireTrimmedString(value, "description");

  if (Buffer.byteLength(description, "utf8") > 65_535) {
    throw new TicketServiceError(400, "description is too long");
  }

  return description;
}

function normalizeEnum(value, fieldName, validValues) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TicketServiceError(400, `${fieldName} is required`);
  }

  const normalizedValue = value.trim().toUpperCase();

  if (!validValues.has(normalizedValue)) {
    throw new TicketServiceError(400, `Invalid ticket ${fieldName}`);
  }

  return normalizedValue;
}

const safeTicketSelect = {
  id: true,
  organizationId: true,
  customerId: true,
  assignedToId: true,
  subject: true,
  description: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, name: true, email: true },
  },
  assignedTo: {
    select: { id: true, name: true, email: true, role: true },
  },
};

export async function listTickets(organizationId, query) {
  const where = { organizationId };

  if (query.status !== undefined) {
    where.status = normalizeEnum(query.status, "status", VALID_STATUSES);
  }

  if (query.priority !== undefined) {
    where.priority = normalizeEnum(query.priority, "priority", VALID_PRIORITIES);
  }

  if (query.customerId !== undefined) {
    where.customerId = parsePositiveInteger(query.customerId, "customerId");
  }

  if (query.assignedToId !== undefined) {
    where.assignedToId = parsePositiveInteger(query.assignedToId, "assignedToId");
  }

  return prisma.ticket.findMany({
    where,
    select: safeTicketSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function getTicket(organizationId, rawTicketId) {
  const ticketId = parsePositiveInteger(rawTicketId, "ticketId");
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId },
    select: safeTicketSelect,
  });

  if (!ticket) {
    throw new TicketServiceError(404, "Ticket not found");
  }

  return ticket;
}

export async function createTicket(organizationId, input) {
  const customerId = parsePositiveInteger(input?.customerId, "customerId");
  const subject = requireTrimmedString(input?.subject, "subject", 255);
  const description = validateDescription(input?.description);
  const priority =
    input?.priority === undefined
      ? undefined
      : normalizeEnum(input.priority, "priority", VALID_PRIORITIES);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });

  if (!customer) {
    throw new TicketServiceError(404, "Customer not found");
  }

  try {
    return await prisma.ticket.create({
      data: {
        organizationId,
        customerId,
        subject,
        description,
        ...(priority && { priority }),
      },
      select: safeTicketSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new TicketServiceError(404, "Customer not found");
    }

    throw error;
  }
}

export async function updateTicket(organizationId, rawTicketId, input) {
  const ticketId = parsePositiveInteger(rawTicketId, "ticketId");
  const data = {};

  if (Object.hasOwn(input ?? {}, "subject")) {
    data.subject = requireTrimmedString(input.subject, "subject", 255);
  }

  if (Object.hasOwn(input ?? {}, "description")) {
    data.description = validateDescription(input.description);
  }

  if (Object.hasOwn(input ?? {}, "status")) {
    data.status = normalizeEnum(input.status, "status", VALID_STATUSES);
  }

  if (Object.hasOwn(input ?? {}, "priority")) {
    data.priority = normalizeEnum(input.priority, "priority", VALID_PRIORITIES);
  }

  if (Object.hasOwn(input ?? {}, "assignedToId")) {
    data.assignedToId =
      input.assignedToId === null
        ? null
        : parsePositiveInteger(input.assignedToId, "assignedToId");
  }

  if (!Object.keys(data).length) {
    throw new TicketServiceError(
      400,
      "Provide subject, description, status, priority, or assignedToId to update",
    );
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({
        where: { id: ticketId, organizationId },
        select: { id: true },
      });

      if (!ticket) {
        throw new TicketServiceError(404, "Ticket not found");
      }

      if (data.assignedToId !== undefined && data.assignedToId !== null) {
        const assignedUser = await transaction.user.findFirst({
          where: { id: data.assignedToId, organizationId },
          select: { id: true },
        });

        if (!assignedUser) {
          throw new TicketServiceError(404, "Assigned user not found");
        }
      }

      return transaction.ticket.update({
        where: { id: ticketId, organizationId },
        data,
        select: safeTicketSelect,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2025")
    ) {
      throw new TicketServiceError(404, "Ticket or assigned user not found");
    }

    throw error;
  }
}

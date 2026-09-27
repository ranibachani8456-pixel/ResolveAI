import { MessageSenderType, Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import prisma from "../config/prisma.js";

const ALLOWED_FIELDS = new Set(["name", "email", "subject", "message"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_MESSAGE_LENGTH = 10_000;

export class PublicSupportServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "PublicSupportServiceError";
    this.statusCode = statusCode;
  }
}

function requirePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicSupportServiceError(400, "Request body must be a JSON object");
  }

  const unexpectedFields = Object.keys(value).filter((field) => !ALLOWED_FIELDS.has(field));
  if (unexpectedFields.length) {
    throw new PublicSupportServiceError(400, `Unsupported field: ${unexpectedFields[0]}`);
  }
}

function requireString(value, fieldName, maximumLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PublicSupportServiceError(400, `${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new PublicSupportServiceError(
      400,
      `${fieldName} must not exceed ${maximumLength} characters`,
    );
  }
  return normalized;
}

function normalizeOrganizationSlug(value) {
  if (typeof value !== "string") {
    throw new PublicSupportServiceError(400, "Invalid organization support address");
  }

  const slug = value.trim().toLowerCase();
  if (!slug || slug.length > 191 || !SLUG_PATTERN.test(slug)) {
    throw new PublicSupportServiceError(400, "Invalid organization support address");
  }
  return slug;
}

export function validatePublicSupportInput(input) {
  requirePlainObject(input);
  const name = requireString(input.name, "name", 191);
  const email = requireString(input.email, "email", 191).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new PublicSupportServiceError(400, "A valid email is required");
  }

  return {
    name,
    email,
    subject: requireString(input.subject, "subject", 255),
    message: requireString(input.message, "message", MAX_MESSAGE_LENGTH),
  };
}

export async function submitPublicSupportRequest(rawSlug, input, database = prisma) {
  const organizationSlug = normalizeOrganizationSlug(rawSlug);
  const data = validatePublicSupportInput(input);

  try {
    return await database.$transaction(async (transaction) => {
      // The public slug is resolved here; the client never chooses a trusted tenant ID.
      const organization = await transaction.organization.findUnique({
        where: { slug: organizationSlug },
        select: { id: true },
      });
      if (!organization) {
        throw new PublicSupportServiceError(404, "Support page not found");
      }

      // The compound unique key prevents cross-tenant customer reuse and duplicate races.
      const customer = await transaction.customer.upsert({
        where: {
          organizationId_email: {
            organizationId: organization.id,
            email: data.email,
          },
        },
        create: {
          organizationId: organization.id,
          name: data.name,
          email: data.email,
        },
        update: {},
        select: { id: true },
      });

      const ticket = await transaction.ticket.create({
        data: {
          organizationId: organization.id,
          customerId: customer.id,
          assignedToId: null,
          subject: data.subject,
          description: data.message,
          status: TicketStatus.OPEN,
          priority: TicketPriority.MEDIUM,
        },
        select: { id: true, subject: true, status: true, priority: true },
      });

      await transaction.message.create({
        data: {
          organizationId: organization.id,
          ticketId: ticket.id,
          senderType: MessageSenderType.CUSTOMER,
          userId: null,
          customerId: customer.id,
          content: data.message,
        },
        select: { id: true },
      });

      // A ticket ID is safe as a display-only reference because no public lookup route exists.
      return {
        ticket: {
          reference: String(ticket.id),
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
        },
      };
    });
  } catch (error) {
    if (error instanceof PublicSupportServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new PublicSupportServiceError(404, "Support page not found");
    }
    throw error;
  }
}

export { MAX_MESSAGE_LENGTH };

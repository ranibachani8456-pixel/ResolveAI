import { MessageSenderType, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

export class MessageServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "MessageServiceError";
    this.statusCode = statusCode;
  }
}

function parseTicketId(value) {
  const ticketId = Number(value);
  // Prisma Int maps to a signed MySQL INTEGER; reject values outside its capacity.
  if (
    typeof value !== "string" || !/^\d+$/.test(value) ||
    !Number.isSafeInteger(ticketId) || ticketId <= 0 || ticketId > 2_147_483_647
  ) {
    throw new MessageServiceError(400, "ticketId must be a positive integer");
  }
  return ticketId;
}

function validateContent(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MessageServiceError(400, "content must be a non-empty string");
  }
  const content = value.trim();
  // MySQL TEXT is limited by UTF-8 bytes, not character count (emoji use multiple bytes).
  if (Buffer.byteLength(content, "utf8") > 65_535) {
    throw new MessageServiceError(400, "content must not exceed 65535 UTF-8 bytes");
  }
  return content;
}

const safeMessageSelect = {
  id: true,
  organizationId: true,
  ticketId: true,
  senderType: true,
  userId: true,
  customerId: true,
  content: true,
  createdAt: true,
  user: { select: { id: true, name: true, role: true } },
  customer: { select: { id: true, name: true } },
};

async function requireTenantTicket(database, organizationId, ticketId) {
  const ticket = await database.ticket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true },
  });
  if (!ticket) {
    // The same 404 hides whether a ticket exists in another tenant.
    throw new MessageServiceError(404, "Ticket not found");
  }
}

export async function listMessages(organizationId, rawTicketId) {
  const ticketId = parseTicketId(rawTicketId);
  await requireTenantTicket(prisma, organizationId, ticketId);
  return prisma.message.findMany({
    where: { organizationId, ticketId },
    select: safeMessageSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function createMessage({ organizationId, userId }, rawTicketId, input) {
  const ticketId = parseTicketId(rawTicketId);
  const content = validateContent(input?.content);
  try {
    return await prisma.$transaction(async (transaction) => {
      await requireTenantTicket(transaction, organizationId, ticketId);
      // Only content comes from the body; all sender identity comes from authentication.
      return transaction.message.create({
        data: {
          organizationId, ticketId, userId, content,
          senderType: MessageSenderType.SUPPORT_AGENT,
          customerId: null,
        },
        select: safeMessageSelect,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new MessageServiceError(404, "Ticket or sender no longer exists");
    }
    throw error;
  }
}

import { AIMessageRole, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import {
  answerKnowledgeQuestion,
  validateQuestion,
} from "./ragService.js";

const CONVERSATION_MESSAGE_LIMIT = 100;

export class AIConversationServiceError extends Error {
  constructor(statusCode, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "AIConversationServiceError";
    this.statusCode = statusCode;
  }
}

const safeConversationSelect = {
  id: true,
  organizationId: true,
  createdByUserId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
};

const safeMessageSelect = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  createdAt: true,
};

function parseConversationId(value) {
  const conversationId = Number(value);
  if (
    typeof value !== "string" || !/^\d+$/.test(value) ||
    !Number.isSafeInteger(conversationId) || conversationId <= 0 || conversationId > 2_147_483_647
  ) {
    throw new AIConversationServiceError(400, "conversationId must be a positive integer");
  }
  return conversationId;
}

function validateCreateInput(input) {
  if (input === undefined) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AIConversationServiceError(400, "Request body may contain only an optional title");
  }
  const keys = Object.keys(input);
  if (keys.some((key) => key !== "title")) {
    throw new AIConversationServiceError(400, "Request body may contain only an optional title");
  }
  if (!keys.includes("title")) return null;
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new AIConversationServiceError(400, "title must be a non-empty string");
  }
  const title = input.title.trim();
  if (Array.from(title).length > 191) {
    throw new AIConversationServiceError(400, "title must not exceed 191 characters");
  }
  return title;
}

function positiveConfiguredInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new AIConversationServiceError(503, "AI conversation service is not configured", new Error(`${name} is invalid`));
  }
  return value;
}

function historyConfiguration(overrides = {}) {
  return {
    maxMessages: positiveConfiguredInteger(
      overrides.maxMessages ?? env.aiHistoryMaxMessages,
      "AI_HISTORY_MAX_MESSAGES",
      1,
      50,
    ),
    maxChars: positiveConfiguredInteger(
      overrides.maxChars ?? env.aiHistoryMaxChars,
      "AI_HISTORY_MAX_CHARS",
      500,
      50_000,
    ),
  };
}

export function boundConversationHistory(messages, maxMessages, maxChars) {
  const selected = [];
  let remaining = maxChars;
  for (const message of messages.slice(-maxMessages).reverse()) {
    if (remaining <= 0) break;
    const content = message.content.slice(0, remaining);
    if (!content) continue;
    selected.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  return selected;
}

async function requireOwnedConversation(database, identity, conversationId) {
  const conversation = await database.aIConversation.findFirst({
    where: {
      id: conversationId,
      organizationId: identity.organizationId,
      createdByUserId: identity.userId,
    },
    select: safeConversationSelect,
  });
  if (!conversation) {
    // One response hides whether the ID belongs to another user or tenant.
    throw new AIConversationServiceError(404, "Conversation not found");
  }
  return conversation;
}

export async function createAIConversation(identity, input, dependencies = {}) {
  const database = dependencies.database ?? prisma;
  const title = validateCreateInput(input);
  return database.aIConversation.create({
    data: {
      organizationId: identity.organizationId,
      createdByUserId: identity.userId,
      title,
    },
    select: safeConversationSelect,
  });
}

export async function listAIConversations(identity, dependencies = {}) {
  const database = dependencies.database ?? prisma;
  return database.aIConversation.findMany({
    where: {
      organizationId: identity.organizationId,
      createdByUserId: identity.userId,
    },
    select: safeConversationSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function getAIConversation(identity, rawConversationId, dependencies = {}) {
  const database = dependencies.database ?? prisma;
  const conversationId = parseConversationId(rawConversationId);
  const conversation = await requireOwnedConversation(database, identity, conversationId);
  const recentMessages = await database.aIMessage.findMany({
    where: { conversationId },
    select: safeMessageSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CONVERSATION_MESSAGE_LIMIT,
  });
  return {
    ...conversation,
    messages: recentMessages.reverse(),
    messageLimit: CONVERSATION_MESSAGE_LIMIT,
  };
}

export async function sendAIConversationMessage(
  identity,
  rawConversationId,
  input,
  dependencies = {},
) {
  const database = dependencies.database ?? prisma;
  const conversationId = parseConversationId(rawConversationId);
  const historySettings = historyConfiguration(dependencies.historyConfig);
  const questionMaxChars = dependencies.ragDependencies?.config?.questionMaxChars ?? env.ragQuestionMaxChars;
  if (!Number.isInteger(questionMaxChars) || questionMaxChars < 100 || questionMaxChars > 10_000) {
    throw new AIConversationServiceError(503, "AI conversation service is not configured");
  }
  const question = validateQuestion(input, questionMaxChars);
  await requireOwnedConversation(database, identity, conversationId);

  const recentMessages = await database.aIMessage.findMany({
    where: { conversationId },
    select: { role: true, content: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: historySettings.maxMessages,
  });
  const history = boundConversationHistory(
    recentMessages.reverse(),
    historySettings.maxMessages,
    historySettings.maxChars,
  );

  // Retrieval and generation happen before the transaction. A provider failure
  // therefore leaves no orphan USER row and can never create an ASSISTANT alone.
  const answerResult = await (dependencies.answerKnowledgeQuestion ?? answerKnowledgeQuestion)(
    identity,
    { question },
    dependencies.ragDependencies,
    { history },
  );

  try {
    const persisted = await database.$transaction(async (transaction) => {
      await requireOwnedConversation(transaction, identity, conversationId);
      const userMessage = await transaction.aIMessage.create({
        data: { conversationId, role: AIMessageRole.USER, content: question },
        select: safeMessageSelect,
      });
      const assistantMessage = await transaction.aIMessage.create({
        data: { conversationId, role: AIMessageRole.ASSISTANT, content: answerResult.answer },
        select: safeMessageSelect,
      });
      await transaction.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
        select: { id: true },
      });
      return { userMessage, assistantMessage };
    });
    return { ...answerResult, ...persisted };
  } catch (error) {
    if (error instanceof AIConversationServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(error.code)) {
      throw new AIConversationServiceError(404, "Conversation not found");
    }
    throw error;
  }
}

export { CONVERSATION_MESSAGE_LIMIT, parseConversationId, validateCreateInput };

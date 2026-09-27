import { env } from "../config/env.js";
import { embedQuery } from "./embeddingService.js";
import { searchReadyDocumentChunks } from "./ragRetrievalService.js";
import { buildBoundedContext, generateGroundedAnswer } from "./answerGenerationService.js";

export const NO_CONTEXT_ANSWER = "I couldn't find enough information in the available knowledge base to answer that question.";

export class RagServiceError extends Error {
  constructor(statusCode, message, stage, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "RagServiceError";
    this.statusCode = statusCode;
    this.stage = stage;
  }
}

function configuredInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RagServiceError(503, "AI service is not configured", "configuration", new Error(`${name} is invalid`));
  }
  return value;
}

function validateQuestion(input, maximumLength) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RagServiceError(400, "Request body must contain only a question", "validation");
  }
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "question") {
    throw new RagServiceError(400, "Request body must contain only a question", "validation");
  }
  if (typeof input.question !== "string" || !input.question.trim()) {
    throw new RagServiceError(400, "question must be a non-empty string", "validation");
  }
  const question = input.question.trim();
  if (question.length > maximumLength) {
    throw new RagServiceError(400, `question must not exceed ${maximumLength} characters`, "validation");
  }
  return question;
}

function configuration(overrides = {}) {
  const result = {
    questionMaxChars: configuredInteger(
      overrides.questionMaxChars ?? env.ragQuestionMaxChars,
      "RAG_QUESTION_MAX_CHARS", 100, 10_000,
    ),
    topK: configuredInteger(overrides.topK ?? env.ragTopK, "RAG_TOP_K", 1, 20),
    contextMaxChars: configuredInteger(
      overrides.contextMaxChars ?? env.ragContextMaxChars,
      "RAG_CONTEXT_MAX_CHARS", 500, 50_000,
    ),
    dimension: configuredInteger(
      overrides.dimension ?? env.embeddingDimension,
      "EMBEDDING_DIMENSION", 1, 3_072,
    ),
    embeddingBatchSize: configuredInteger(
      overrides.embeddingBatchSize ?? env.embeddingBatchSize,
      "EMBEDDING_BATCH_SIZE", 1, 100,
    ),
    embeddingModel: overrides.embeddingModel ?? env.embeddingModel,
    collection: overrides.collection ?? env.qdrantCollection,
    generationModel: overrides.generationModel ?? env.geminiGenerationModel,
    apiKey: overrides.apiKey ?? env.geminiApiKey,
    qdrantUrl: overrides.qdrantUrl ?? env.qdrantUrl,
  };
  if (
    typeof result.apiKey !== "string" || !result.apiKey.trim() ||
    typeof result.qdrantUrl !== "string" || !result.qdrantUrl.trim() ||
    typeof result.collection !== "string" || !result.collection.trim() ||
    typeof result.embeddingModel !== "string" || !result.embeddingModel.trim() ||
    typeof result.generationModel !== "string" || !result.generationModel.trim()
  ) {
    throw new RagServiceError(503, "AI service is not configured", "configuration");
  }
  return result;
}

function sourcesFrom(items) {
  return items.map(({ documentId, fileName, chunkIndex }) => ({ documentId, fileName, chunkIndex }));
}

export async function answerKnowledgeQuestion(identity, input, dependencies = {}, options = {}) {
  const questionMaxChars = dependencies.config?.questionMaxChars ?? env.ragQuestionMaxChars;
  if (!Number.isInteger(questionMaxChars) || questionMaxChars < 100 || questionMaxChars > 10_000) {
    throw new RagServiceError(503, "AI service is not configured", "configuration");
  }
  const question = validateQuestion(input, questionMaxChars);
  const settings = configuration(dependencies.config);

  let queryVector;
  try {
    queryVector = await (dependencies.embedQuery ?? embedQuery)(question, {
      ...dependencies.embedding,
      apiKey: settings.apiKey,
      model: settings.embeddingModel,
      dimension: settings.dimension,
      batchSize: settings.embeddingBatchSize,
    });
  } catch (error) {
    throw new RagServiceError(502, "Unable to process question embedding", "embedding", error);
  }

  let chunks;
  try {
    chunks = await (dependencies.searchReadyDocumentChunks ?? searchReadyDocumentChunks)(
      identity.organizationId,
      queryVector,
      dependencies.database,
      {
        ...dependencies.retrieval,
        topK: settings.topK,
        collection: settings.collection,
        dimension: settings.dimension,
      },
    );
  } catch (error) {
    throw new RagServiceError(503, "Knowledge retrieval is temporarily unavailable", "retrieval", error);
  }

  const bounded = buildBoundedContext(chunks, settings.contextMaxChars);
  if (!bounded.items.length) {
    return { answer: NO_CONTEXT_ANSWER, sources: [] };
  }

  let answer;
  try {
    answer = await (dependencies.generateGroundedAnswer ?? generateGroundedAnswer)(
      question,
      bounded.context,
      {
        ...dependencies.generation,
        apiKey: settings.apiKey,
        model: settings.generationModel,
        history: options.history ?? [],
      },
    );
  } catch (error) {
  console.error("Gemini generation diagnostic:", {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    message: error?.message,
  });

  throw new RagServiceError(
    502,
    "Unable to generate a grounded answer",
    "generation",
    error,
  );
}

  return { answer, sources: sourcesFrom(bounded.items) };
}

export { validateQuestion };

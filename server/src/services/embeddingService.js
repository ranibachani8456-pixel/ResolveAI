import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

function embeddingConfiguration(overrides = {}) {
  const apiKey = overrides.apiKey ?? env.geminiApiKey;
  const model = overrides.model ?? env.embeddingModel;
  const dimension = overrides.dimension ?? env.embeddingDimension;
  const batchSize = overrides.batchSize ?? env.embeddingBatchSize;
  if (!apiKey || !model) throw new Error("Embedding worker configuration is missing");
  if (!Number.isInteger(dimension) || dimension <= 0 || dimension > 3_072) {
    throw new Error("EMBEDDING_DIMENSION must be an integer from 1 to 3072");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 100) {
    throw new Error("EMBEDDING_BATCH_SIZE must be an integer from 1 to 100");
  }
  return { apiKey, model, dimension, batchSize };
}

export async function embedTexts(texts, overrides = {}) {
  if (!Array.isArray(texts) || !texts.length || texts.some((text) => typeof text !== "string" || !text)) {
    throw new Error("Embedding input must contain non-empty text strings");
  }
  const configuration = embeddingConfiguration(overrides);
  const client = overrides.client ?? new GoogleGenAI({ apiKey: configuration.apiKey });
  const vectors = [];
  for (let index = 0; index < texts.length; index += configuration.batchSize) {
    const batch = texts.slice(index, index + configuration.batchSize);
    const response = await client.models.embedContent({
      model: configuration.model,
      contents: batch,
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: configuration.dimension,
      },
    });
    if (!Array.isArray(response.embeddings) || response.embeddings.length !== batch.length) {
      throw new Error("Embedding provider returned an unexpected vector count");
    }
    for (const embedding of response.embeddings) {
      const values = embedding?.values;
      if (
        !Array.isArray(values) || values.length !== configuration.dimension ||
        values.some((value) => typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new Error("Embedding provider returned a malformed vector");
      }
      vectors.push(values);
    }
  }
  return vectors;
}

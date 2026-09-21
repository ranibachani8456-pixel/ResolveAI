import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { getQdrantClient } from "../config/qdrant.js";

function deterministicPointId(organizationId, documentId, chunkIndex) {
  const hex = createHash("sha256").update(`${organizationId}:${documentId}:${chunkIndex}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isNotFound(error) {
  return error?.status === 404 || error?.statusCode === 404 || error?.response?.status === 404;
}

export async function ensureDocumentCollection(overrides = {}) {
  const client = overrides.client ?? getQdrantClient();
  const collection = overrides.collection ?? env.qdrantCollection;
  const dimension = overrides.dimension ?? env.embeddingDimension;
  if (!collection || !Number.isInteger(dimension) || dimension <= 0) {
    throw new Error("Qdrant worker configuration is invalid");
  }

  let info;
  try {
    info = await client.getCollection(collection);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    try {
      await client.createCollection(collection, { vectors: { size: dimension, distance: "Cosine" } });
    } catch (creationError) {
      // Another worker may have created it concurrently; verify rather than recreate.
      if (!String(creationError?.message || "").toLowerCase().includes("already exists")) throw creationError;
    }
    info = await client.getCollection(collection);
  }

  const vectors = info?.config?.params?.vectors;
  if (!vectors || Number(vectors.size) !== dimension || String(vectors.distance).toLowerCase() !== "cosine") {
    throw new Error("Existing Qdrant collection is incompatible with embedding configuration");
  }
  return { client, collection, dimension };
}

export async function upsertDocumentVectors(document, chunks, vectors, overrides = {}) {
  if (chunks.length !== vectors.length || !chunks.length) {
    throw new Error("Chunk and embedding counts must match");
  }
  const configuration = await ensureDocumentCollection(overrides);
  const batchSize = 64;
  const points = chunks.map((chunk, index) => ({
    id: deterministicPointId(document.organizationId, document.id, chunk.chunkIndex),
    vector: vectors[index],
    payload: {
      organizationId: document.organizationId,
      documentId: document.id,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      fileName: document.fileName,
      mimeType: document.mimeType,
    },
  }));
  for (let index = 0; index < points.length; index += batchSize) {
    await configuration.client.upsert(configuration.collection, {
      wait: true,
      points: points.slice(index, index + batchSize),
    });
  }
  return points.map((point) => point.id);
}

export { deterministicPointId };

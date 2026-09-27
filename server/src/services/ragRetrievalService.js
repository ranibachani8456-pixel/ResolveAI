import prisma from "../config/prisma.js";
import { ensureDocumentCollection } from "./documentVectorService.js";

function validPayloadPoint(point, organizationId) {
  const payload = point?.payload;
  return (
    payload &&
    payload.organizationId === organizationId &&
    Number.isInteger(payload.documentId) && payload.documentId > 0 &&
    Number.isInteger(payload.chunkIndex) && payload.chunkIndex >= 0 &&
    typeof payload.text === "string" && payload.text.trim() &&
    typeof point.score === "number" && Number.isFinite(point.score)
  );
}

export async function searchReadyDocumentChunks(
  organizationId,
  queryVector,
  database = prisma,
  options = {},
) {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error("Authenticated organization is invalid");
  }
  if (!Array.isArray(queryVector) || !queryVector.length || queryVector.some((value) => !Number.isFinite(value))) {
    throw new Error("Query embedding is invalid");
  }
  const topK = options.topK;
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("RAG_TOP_K must be an integer from 1 to 20");
  }

  const collectionConfiguration = await (options.ensureCollection ?? ensureDocumentCollection)({
    client: options.client,
    collection: options.collection,
    dimension: options.dimension,
  });
  if (queryVector.length !== collectionConfiguration.dimension) {
    throw new Error("Query embedding dimension does not match the Qdrant collection");
  }

  const result = await collectionConfiguration.client.query(collectionConfiguration.collection, {
    query: queryVector,
    filter: {
      must: [{ key: "organizationId", match: { value: organizationId } }],
    },
    limit: topK,
    with_payload: ["organizationId", "documentId", "chunkIndex", "text"],
    with_vector: false,
  });

  // Defensively validate payload tenant IDs even though Qdrant performs the required
  // server-side tenant filter. This guards against corrupt or stale vector payloads.
  const candidates = (result?.points ?? []).filter((point) => validPayloadPoint(point, organizationId));
  const documentIds = [...new Set(candidates.map((point) => point.payload.documentId))];
  if (!documentIds.length) return [];

  // One tenant-scoped query avoids N+1 lookups and excludes stale, missing, or
  // non-READY MySQL metadata before any text reaches the generation model.
  const documents = await database.document.findMany({
    where: {
      id: { in: documentIds },
      organizationId,
      status: "READY",
    },
    select: { id: true, fileName: true },
  });
  const readyDocuments = new Map(documents.map((document) => [document.id, document]));
  const seenChunks = new Set();

  return candidates.flatMap((point) => {
    const payload = point.payload;
    const document = readyDocuments.get(payload.documentId);
    const chunkKey = `${payload.documentId}:${payload.chunkIndex}`;
    if (!document || seenChunks.has(chunkKey)) return [];
    seenChunks.add(chunkKey);
    return [{
      documentId: document.id,
      fileName: document.fileName,
      chunkIndex: payload.chunkIndex,
      text: payload.text.trim(),
      score: point.score,
    }];
  });
}

import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { downloadDocument } from "./documentStorageService.js";
import { extractDocumentText } from "./documentExtractionService.js";
import { chunkDocumentText } from "./documentChunkingService.js";
import { embedTexts } from "./embeddingService.js";
import { upsertDocumentVectors } from "./documentVectorService.js";
import { DocumentProcessingBusyError, PermanentDocumentError } from "./documentProcessingErrors.js";

const processingDocumentSelect = {
  id: true,
  organizationId: true,
  fileName: true,
  mimeType: true,
  storageKey: true,
  status: true,
  updatedAt: true,
};

async function claimDocument(job, database, dependencies) {
  const now = dependencies.now?.() ?? new Date();
  const leaseSeconds = dependencies.leaseSeconds ?? env.documentProcessingLeaseSeconds;
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30) {
    throw new Error("DOCUMENT_PROCESSING_LEASE_SECONDS must be an integer of at least 30");
  }

  const initialClaim = await database.document.updateMany({
    where: { id: job.documentId, organizationId: job.organizationId, status: "PENDING" },
    data: { status: "PROCESSING" },
  });

  let document = await database.document.findFirst({
    where: { id: job.documentId, organizationId: job.organizationId },
    select: processingDocumentSelect,
  });
  if (!document) return { outcome: "MISSING" };
  if (document.status === "READY") return { outcome: "ALREADY_READY", document };
  if (document.status === "FAILED") return { outcome: "FAILED_SKIPPED", document };
  if (document.status !== "PROCESSING") throw new Error("Document has an unsupported processing status");
  if (initialClaim.count === 1) return { outcome: "CLAIMED", document };

  const leaseCutoff = new Date(now.getTime() - leaseSeconds * 1_000);
  const retryClaim = await database.document.updateMany({
    where: {
      id: job.documentId,
      organizationId: job.organizationId,
      status: "PROCESSING",
      updatedAt: { lte: leaseCutoff },
    },
    data: { status: "PROCESSING" },
  });
  if (retryClaim.count !== 1) throw new DocumentProcessingBusyError();

  document = await database.document.findFirst({
    where: { id: job.documentId, organizationId: job.organizationId },
    select: processingDocumentSelect,
  });
  if (!document || document.status !== "PROCESSING") throw new Error("Document processing lease could not be verified");
  return { outcome: "RETRY_CLAIMED", document };
}

async function markPermanentFailure(document, database) {
  const update = await database.document.updateMany({
    where: { id: document.id, organizationId: document.organizationId, status: "PROCESSING" },
    data: { status: "FAILED" },
  });
  if (update.count === 1) return { outcome: "FAILED", status: "FAILED" };

  const current = await database.document.findFirst({
    where: { id: document.id, organizationId: document.organizationId },
    select: { status: true },
  });
  if (current?.status === "READY") return { outcome: "ALREADY_READY", status: "READY" };
  if (current?.status === "FAILED") return { outcome: "FAILED_SKIPPED", status: "FAILED" };
  throw new Error("Permanent document failure could not be recorded");
}

export async function processDocumentJob(job, database = prisma, dependencies = {}) {
  const claim = await claimDocument(job, database, dependencies);
  if (claim.outcome === "MISSING") return { outcome: "MISSING", status: null };
  if (claim.outcome === "ALREADY_READY") return { outcome: "ALREADY_READY", status: "READY" };
  if (claim.outcome === "FAILED_SKIPPED") return { outcome: "FAILED_SKIPPED", status: "FAILED" };

  const document = claim.document;
  console.log(`Document processing started: documentId=${document.id} organizationId=${document.organizationId}`);

  try {
    const buffer = await (dependencies.downloadDocument ?? downloadDocument)(document, dependencies.storage);
    const text = await (dependencies.extractDocumentText ?? extractDocumentText)(document, buffer, dependencies.extraction);
    console.log(`Document extraction complete: documentId=${document.id} characters=${text.length}`);

    const chunks = (dependencies.chunkDocumentText ?? chunkDocumentText)(text, dependencies.chunking);
    if (!chunks.length) throw new PermanentDocumentError("Document produced no usable chunks");
    console.log(`Document chunking complete: documentId=${document.id} chunks=${chunks.length}`);

    const vectors = await (dependencies.embedTexts ?? embedTexts)(
      chunks.map((chunk) => chunk.text),
      dependencies.embedding,
    );
    await (dependencies.upsertDocumentVectors ?? upsertDocumentVectors)(
      document,
      chunks,
      vectors,
      dependencies.vector,
    );

    const ready = await database.document.updateMany({
      where: { id: document.id, organizationId: document.organizationId, status: "PROCESSING" },
      data: { status: "READY" },
    });
    if (ready.count !== 1) {
      const current = await database.document.findFirst({
        where: { id: document.id, organizationId: document.organizationId },
        select: { status: true },
      });
      if (current?.status !== "READY") throw new Error("Document READY status could not be recorded");
    }

    console.log(`Document indexing complete: documentId=${document.id} organizationId=${document.organizationId} chunks=${chunks.length} status=READY`);
    return {
      outcome: claim.outcome === "RETRY_CLAIMED" ? "RETRY_COMPLETED" : "COMPLETED",
      status: "READY",
      chunkCount: chunks.length,
    };
  } catch (error) {
    if (error instanceof PermanentDocumentError) {
      console.error(`Document permanent failure: documentId=${document.id} organizationId=${document.organizationId} reason=${error.message}`);
      return markPermanentFailure(document, database);
    }
    throw error;
  }
}

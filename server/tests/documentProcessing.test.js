import assert from "node:assert/strict";
import { test } from "node:test";
import { processDocumentJob } from "../src/services/documentProcessingService.js";
import {
  DocumentProcessingBusyError,
  PermanentDocumentError,
} from "../src/services/documentProcessingErrors.js";

const job = { documentId: 17, organizationId: 3 };
const fixedNow = new Date("2026-09-20T12:00:00.000Z");

function matches(document, where) {
  if (where.id !== undefined && document.id !== where.id) return false;
  if (where.organizationId !== undefined && document.organizationId !== where.organizationId) return false;
  if (where.status !== undefined && document.status !== where.status) return false;
  if (where.updatedAt?.lte && document.updatedAt > where.updatedAt.lte) return false;
  return true;
}

function createDatabase(overrides = {}) {
  const document = {
    id: 17,
    organizationId: 3,
    fileName: "guide.txt",
    mimeType: "text/plain",
    storageKey: "organizations/3/documents/trusted.txt",
    status: "PENDING",
    updatedAt: new Date("2026-09-20T11:00:00.000Z"),
    ...overrides.document,
  };
  const calls = [];
  const database = {
    document: {
      updateMany: async ({ where, data }) => {
        calls.push({ operation: "updateMany", where, data });
        if (overrides.failReadyUpdate && data.status === "READY") throw new Error("database unavailable");
        if (!matches(document, where)) return { count: 0 };
        Object.assign(document, data, { updatedAt: fixedNow });
        return { count: 1 };
      },
      findFirst: async ({ where }) => {
        calls.push({ operation: "findFirst", where });
        return matches(document, where) ? { ...document } : null;
      },
    },
  };
  return { database, document, calls };
}

function successfulDependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    dependencies: {
      now: () => fixedNow,
      leaseSeconds: 240,
      downloadDocument: async (document) => {
        calls.push(["download", document.storageKey]);
        return Buffer.from("ResolveAI support knowledge");
      },
      extractDocumentText: async (document, buffer) => {
        calls.push(["extract", document.mimeType, buffer.toString()]);
        return buffer.toString();
      },
      chunkDocumentText: (text) => {
        calls.push(["chunk", text]);
        return [{ chunkIndex: 0, text }];
      },
      embedTexts: async (texts) => {
        calls.push(["embed", texts]);
        return [[1, 0, 0]];
      },
      upsertDocumentVectors: async (document, chunks, vectors) => {
        calls.push(["upsert", document.organizationId, chunks, vectors]);
      },
      ...overrides,
    },
  };
}

test("document processing lifecycle", async (context) => {
  await context.test("claims a tenant-scoped document and marks it READY only after indexing", async () => {
    const { database, document, calls: databaseCalls } = createDatabase();
    const { dependencies, calls } = successfulDependencies();

    const result = await processDocumentJob(job, database, dependencies);

    assert.deepEqual(result, { outcome: "COMPLETED", status: "READY", chunkCount: 1 });
    assert.equal(document.status, "READY");
    assert.deepEqual(calls.map(([operation]) => operation), ["download", "extract", "chunk", "embed", "upsert"]);
    assert.equal(calls[0][1], "organizations/3/documents/trusted.txt");
    for (const call of databaseCalls) {
      assert.equal(call.where.id, 17);
      assert.equal(call.where.organizationId, 3);
    }
  });

  await context.test("does not process cross-tenant, READY, or FAILED documents", async () => {
    const noExternalCalls = async (document, expected) => {
      const { database } = createDatabase({ document });
      const { dependencies, calls } = successfulDependencies();
      assert.deepEqual(await processDocumentJob(job, database, dependencies), expected);
      assert.equal(calls.length, 0);
    };

    await noExternalCalls({ organizationId: 4 }, { outcome: "MISSING", status: null });
    await noExternalCalls({ status: "READY" }, { outcome: "ALREADY_READY", status: "READY" });
    await noExternalCalls({ status: "FAILED" }, { outcome: "FAILED_SKIPPED", status: "FAILED" });
  });

  await context.test("reclaims only stale PROCESSING work", async () => {
    const stale = createDatabase({
      document: { status: "PROCESSING", updatedAt: new Date("2026-09-20T11:55:00.000Z") },
    });
    const { dependencies } = successfulDependencies();
    assert.deepEqual(await processDocumentJob(job, stale.database, dependencies), {
      outcome: "RETRY_COMPLETED", status: "READY", chunkCount: 1,
    });

    const fresh = createDatabase({
      document: { status: "PROCESSING", updatedAt: new Date("2026-09-20T11:59:00.000Z") },
    });
    const freshDependencies = successfulDependencies();
    await assert.rejects(
      processDocumentJob(job, fresh.database, freshDependencies.dependencies),
      DocumentProcessingBusyError,
    );
    assert.equal(fresh.document.status, "PROCESSING");
    assert.equal(freshDependencies.calls.length, 0);
  });

  await context.test("marks permanent content failures FAILED", async () => {
    const { database, document } = createDatabase();
    const { dependencies } = successfulDependencies({
      extractDocumentText: async () => { throw new PermanentDocumentError("unsupported content"); },
    });
    assert.deepEqual(await processDocumentJob(job, database, dependencies), { outcome: "FAILED", status: "FAILED" });
    assert.equal(document.status, "FAILED");
  });

  await context.test("leaves transient failures PROCESSING for retry", async () => {
    const { database, document } = createDatabase();
    const transient = new Error("embedding provider timeout");
    const { dependencies } = successfulDependencies({
      embedTexts: async () => { throw transient; },
    });
    await assert.rejects(processDocumentJob(job, database, dependencies), (error) => error === transient);
    assert.equal(document.status, "PROCESSING");
  });

  await context.test("does not report success when the final database update fails", async () => {
    const { database, document } = createDatabase({ failReadyUpdate: true });
    const { dependencies } = successfulDependencies();
    await assert.rejects(processDocumentJob(job, database, dependencies), /database unavailable/);
    assert.equal(document.status, "PROCESSING");
  });
});

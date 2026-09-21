import assert from "node:assert/strict";
import { test } from "node:test";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { bodyToBuffer, downloadDocument } from "../src/services/documentStorageService.js";
import { extractDocumentText, normalizeDocumentText } from "../src/services/documentExtractionService.js";
import { chunkDocumentText } from "../src/services/documentChunkingService.js";
import { embedTexts } from "../src/services/embeddingService.js";
import {
  deterministicPointId,
  ensureDocumentCollection,
  upsertDocumentVectors,
} from "../src/services/documentVectorService.js";
import { PermanentDocumentError } from "../src/services/documentProcessingErrors.js";

function createPdf(text = "") {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = text ? `BT\n/F1 14 Tf\n72 720 Td\n(${escaped}) Tj\nET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(output);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

test("trusted S3 retrieval and text extraction", async (context) => {
  await context.test("uses the trusted key and bucket and bounds streamed bytes", async () => {
    const client = { send: async (command) => {
      assert.ok(command instanceof GetObjectCommand);
      assert.deepEqual(command.input, { Bucket: "private-bucket", Key: "organizations/7/documents/trusted.txt" });
      return { ContentLength: 11, Body: (async function* () { yield Buffer.from("hello "); yield Buffer.from("world"); })() };
    } };
    const buffer = await downloadDocument(
      { storageKey: "organizations/7/documents/trusted.txt" },
      { client, bucket: "private-bucket", region: "us-east-1" },
    );
    assert.equal(buffer.toString(), "hello world");
    await assert.rejects(bodyToBuffer(Buffer.alloc(11), 10), PermanentDocumentError);
  });

  await context.test("distinguishes missing objects from transient S3 failures", async () => {
    const document = { storageKey: "trusted-key" };
    await assert.rejects(downloadDocument(document, {
      bucket: "bucket", region: "region", client: { send: async () => {
        const error = new Error("missing"); error.name = "NoSuchKey"; throw error;
      } },
    }), PermanentDocumentError);
    const transient = new Error("temporary S3 outage");
    await assert.rejects(downloadDocument(document, {
      bucket: "bucket", region: "region", client: { send: async () => { throw transient; } },
    }), (error) => error === transient);
  });

  await context.test("extracts UTF-8 and real text-based PDFs and rejects unusable content", async () => {
    assert.equal(
      await extractDocumentText({ mimeType: "text/plain" }, Buffer.from(" First\r\nline\r\n\r\n\r\nSecond\u0000  \n")),
      "First\nline\n\nSecond",
    );
    assert.match(
      await extractDocumentText({ mimeType: "application/pdf" }, createPdf("Hello ResolveAI PDF")),
      /Hello ResolveAI PDF/,
    );
    await assert.rejects(
      extractDocumentText({ mimeType: "text/plain" }, Buffer.from([0xff, 0xfe])),
      PermanentDocumentError,
    );
    await assert.rejects(
      extractDocumentText({ mimeType: "text/plain" }, Buffer.from(" \r\n\t ")),
      PermanentDocumentError,
    );
    await assert.rejects(
      extractDocumentText({ mimeType: "application/pdf" }, Buffer.from("not a pdf")),
      PermanentDocumentError,
    );
    await assert.rejects(
      extractDocumentText({ mimeType: "application/pdf" }, createPdf()),
      (error) => error instanceof PermanentDocumentError && error.message.includes("OCR"),
    );
    assert.equal(normalizeDocumentText("a\r\n\r\n\r\n b \u0000"), "a\n\n b");
    assert.throws(() => normalizeDocumentText(null), PermanentDocumentError);
  });
});

test("deterministic bounded document chunking", async (context) => {
  await context.test("keeps short documents whole and never emits empty chunks", () => {
    assert.deepEqual(chunkDocumentText("Short useful paragraph."), [{ chunkIndex: 0, text: "Short useful paragraph." }]);
    assert.deepEqual(chunkDocumentText("  "), []);
  });

  await context.test("uses stable ordering, semantic boundaries, overlap and a hard maximum", () => {
    const text = Array.from({ length: 80 }, (_, index) =>
      `Paragraph ${index}. This sentence contains stable ResolveAI support knowledge and useful punctuation.`,
    ).join("\n\n");
    const first = chunkDocumentText(text, { targetSize: 500, overlap: 80 });
    const second = chunkDocumentText(text, { targetSize: 500, overlap: 80 });
    assert.deepEqual(first, second);
    assert.ok(first.length > 2);
    first.forEach((chunk, index) => {
      assert.equal(chunk.chunkIndex, index);
      assert.ok(chunk.text.length > 0 && chunk.text.length <= 500);
    });
    const sharedWords = first[0].text.split(/\s+/).slice(-10).filter((word) => first[1].text.includes(word));
    assert.ok(sharedWords.length > 0, "successive chunks should retain contextual overlap");
  });
});

test("embedding batching and response validation", async (context) => {
  await context.test("batches requests with retrieval-document configuration", async () => {
    const calls = [];
    const client = { models: { embedContent: async (request) => {
      calls.push(request);
      return { embeddings: request.contents.map((_, index) => ({ values: [index, 0.5, 1] })) };
    } } };
    const vectors = await embedTexts(["one", "two", "three", "four", "five"], {
      client, apiKey: "test-only", model: "test-model", dimension: 3, batchSize: 2,
    });
    assert.equal(calls.length, 3);
    assert.equal(vectors.length, 5);
    for (const call of calls) {
      assert.equal(call.config.taskType, "RETRIEVAL_DOCUMENT");
      assert.equal(call.config.outputDimensionality, 3);
    }
  });

  await context.test("rejects malformed vectors and preserves provider errors as transient", async () => {
    await assert.rejects(embedTexts(["one"], {
      client: { models: { embedContent: async () => ({ embeddings: [] }) } },
      apiKey: "test", model: "test", dimension: 3,
    }), /unexpected vector count/);
    await assert.rejects(embedTexts(["one"], {
      client: { models: { embedContent: async () => ({ embeddings: [{ values: [1, 2] }] }) } },
      apiKey: "test", model: "test", dimension: 3,
    }), /malformed vector/);
    const transient = new Error("provider timeout");
    await assert.rejects(embedTexts(["one"], {
      client: { models: { embedContent: async () => { throw transient; } } },
      apiKey: "test", model: "test", dimension: 3,
    }), (error) => error === transient);
  });
});

test("Qdrant collection and tenant-safe idempotent vectors", async (context) => {
  const compatible = { config: { params: { vectors: { size: 3, distance: "Cosine" } } } };

  await context.test("creates a missing cosine collection without recreating existing data", async () => {
    const calls = [];
    let exists = false;
    const client = {
      getCollection: async (name) => {
        calls.push(["get", name]);
        if (!exists) { const error = new Error("missing"); error.status = 404; throw error; }
        return compatible;
      },
      createCollection: async (name, options) => {
        calls.push(["create", name, options]); exists = true;
      },
    };
    await ensureDocumentCollection({ client, collection: "documents", dimension: 3 });
    assert.deepEqual(calls[1], ["create", "documents", { vectors: { size: 3, distance: "Cosine" } }]);
    calls.length = 0;
    await ensureDocumentCollection({ client, collection: "documents", dimension: 3 });
    assert.deepEqual(calls, [["get", "documents"]]);
  });

  await context.test("rejects incompatible collections", async () => {
    await assert.rejects(ensureDocumentCollection({
      client: { getCollection: async () => ({ config: { params: { vectors: { size: 4, distance: "Dot" } } } }) },
      collection: "documents", dimension: 3,
    }), /incompatible/);
  });

  await context.test("upserts deterministic IDs and tenant-filterable safe payloads", async () => {
    const requests = [];
    const client = {
      getCollection: async () => compatible,
      upsert: async (name, request) => requests.push({ name, request }),
    };
    const document = { id: 11, organizationId: 7, fileName: "guide.txt", mimeType: "text/plain", storageKey: "private" };
    const chunks = [{ chunkIndex: 0, text: "first" }, { chunkIndex: 1, text: "second" }];
    const vectors = [[1, 0, 0], [0, 1, 0]];
    const firstIds = await upsertDocumentVectors(document, chunks, vectors, { client, collection: "documents", dimension: 3 });
    const secondIds = await upsertDocumentVectors(document, chunks, vectors, { client, collection: "documents", dimension: 3 });
    assert.deepEqual(firstIds, secondIds);
    assert.equal(firstIds[0], deterministicPointId(7, 11, 0));
    for (const point of requests[0].request.points) {
      assert.equal(point.payload.organizationId, 7);
      assert.equal(point.payload.documentId, 11);
      assert.equal("storageKey" in point.payload, false);
      assert.equal(requests[0].request.wait, true);
    }
  });

  await context.test("partial upsert retries converge on the same point IDs", async () => {
    const attempts = [];
    let fail = true;
    const client = {
      getCollection: async () => compatible,
      upsert: async (_name, request) => {
        attempts.push(request.points.map((point) => point.id));
        if (fail && attempts.length === 2) { fail = false; throw new Error("temporary Qdrant outage"); }
      },
    };
    const document = { id: 12, organizationId: 8, fileName: "long.txt", mimeType: "text/plain" };
    const chunks = Array.from({ length: 65 }, (_, chunkIndex) => ({ chunkIndex, text: `chunk ${chunkIndex}` }));
    const vectors = chunks.map(() => [1, 0, 0]);
    await assert.rejects(upsertDocumentVectors(document, chunks, vectors, { client, collection: "documents", dimension: 3 }));
    await upsertDocumentVectors(document, chunks, vectors, { client, collection: "documents", dimension: 3 });
    assert.deepEqual(attempts[0], attempts[2]);
    assert.deepEqual(attempts[1], attempts[3]);
  });
});

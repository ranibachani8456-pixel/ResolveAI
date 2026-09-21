import assert from "node:assert/strict";
import { test } from "node:test";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  createDocumentProcessingMessage,
  enqueueDocumentProcessing,
  parseDocumentProcessingMessage,
} from "../src/services/documentQueueService.js";
import { handleDocumentQueueMessage, runDocumentWorker } from "../src/workers/documentWorker.js";

const validJob = { type: "DOCUMENT_PROCESSING_REQUESTED", version: 1, documentId: 17, organizationId: 3 };
const envelope = (overrides = {}) => ({
  MessageId: "message-1",
  ReceiptHandle: "receipt-1",
  Body: JSON.stringify(validJob),
  Attributes: { ApproximateReceiveCount: "1" },
  ...overrides,
});

test("document queue producer contract", async (context) => {
  await context.test("publishes only the required identifiers to the configured queue", async () => {
    const commands = [];
    const client = { send: async (command) => commands.push(command) };
    const message = await enqueueDocumentProcessing(
      { documentId: 17, organizationId: 3, storageKey: "secret", jwt: "secret", file: Buffer.from("secret") },
      { client, queueUrl: "https://sqs.example/resolveai", region: "us-east-1" },
    );
    assert.deepEqual(message, validJob);
    assert.ok(commands[0] instanceof SendMessageCommand);
    assert.equal(commands[0].input.QueueUrl, "https://sqs.example/resolveai");
    assert.deepEqual(JSON.parse(commands[0].input.MessageBody), validJob);
    for (const forbidden of ["storageKey", "jwt", "file", "secret"]) {
      assert.equal(commands[0].input.MessageBody.includes(forbidden), false);
    }
  });

  await context.test("strictly rejects malformed or unsupported messages and unsafe IDs", () => {
    const invalidBodies = [
      undefined, "", "not json", "null", "[]", "{}",
      JSON.stringify({ ...validJob, type: undefined }),
      JSON.stringify({ ...validJob, type: "OTHER" }),
      JSON.stringify({ ...validJob, version: 2 }),
      JSON.stringify({ ...validJob, extra: true }),
      ...[0, -1, 1.5, "17", Number.MAX_SAFE_INTEGER, 2_147_483_648].map((documentId) => JSON.stringify({ ...validJob, documentId })),
      ...[0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER, 2_147_483_648].map((organizationId) => JSON.stringify({ ...validJob, organizationId })),
    ];
    for (const body of invalidBodies) assert.throws(() => parseDocumentProcessingMessage(body));
    assert.deepEqual(parseDocumentProcessingMessage(JSON.stringify(validJob)), validJob);
    assert.throws(() => createDocumentProcessingMessage({ documentId: 2_147_483_648, organizationId: 3 }));
  });
});

test("document worker processing and acknowledgement semantics", async (context) => {
  await context.test("deletes only successfully handled messages", async () => {
    const commands = [];
    const client = { send: async (command) => commands.push(command) };
    const handled = await handleDocumentQueueMessage(envelope(), {
      client, queueUrl: "https://sqs.example/queue", region: "us-east-1",
      processor: async (job) => {
        assert.deepEqual(job, validJob);
        return { outcome: "COMPLETED", status: "READY" };
      },
    });
    assert.equal(handled.result.outcome, "COMPLETED");
    assert.ok(commands[0] instanceof DeleteMessageCommand);
    assert.deepEqual(commands[0].input, { QueueUrl: "https://sqs.example/queue", ReceiptHandle: "receipt-1" });

    commands.length = 0;
    await assert.rejects(handleDocumentQueueMessage(envelope(), {
      client, queueUrl: "https://sqs.example/queue", region: "us-east-1",
      processor: async () => { throw new Error("synthetic processing failure"); },
    }));
    assert.equal(commands.length, 0);

    await assert.rejects(handleDocumentQueueMessage(envelope({ Body: "not json" }), {
      client, queueUrl: "https://sqs.example/queue", region: "us-east-1",
    }));
    assert.equal(commands.length, 0);
  });

  await context.test("acknowledges a permanently failed document result", async () => {
    const commands = [];
    const client = { send: async (command) => commands.push(command) };
    const handled = await handleDocumentQueueMessage(envelope(), {
      client, queueUrl: "https://sqs.example/queue", region: "us-east-1",
      processor: async () => ({ outcome: "FAILED", status: "FAILED" }),
    });
    assert.equal(handled.result.status, "FAILED");
    assert.ok(commands[0] instanceof DeleteMessageCommand);
  });

  await context.test("long-poll loop aborts and disconnects cleanly", async () => {
    const controller = new AbortController();
    let disconnected = false;
    let destroyed = false;
    const client = {
      send: async (command, options) => {
        assert.ok(command instanceof ReceiveMessageCommand);
        assert.equal(command.input.WaitTimeSeconds, 20);
        assert.equal(command.input.MaxNumberOfMessages, 5);
        return new Promise((resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      },
      destroy: () => { destroyed = true; },
    };
    const database = { $disconnect: async () => { disconnected = true; } };
    setTimeout(() => controller.abort(), 10);
    await runDocumentWorker({
      client, database, signal: controller.signal,
      queueUrl: "https://sqs.example/queue", region: "us-east-1",
    });
    assert.equal(disconnected, true);
    assert.equal(destroyed, true);
  });
});

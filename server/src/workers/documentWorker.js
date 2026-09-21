import { pathToFileURL } from "node:url";
import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import prisma from "../config/prisma.js";
import sqsClient from "../config/sqs.js";
import { env } from "../config/env.js";
import { DocumentQueueMessageError, parseDocumentProcessingMessage } from "../services/documentQueueService.js";
import { processDocumentJob } from "../services/documentProcessingService.js";

function queueConfiguration(overrides = {}) {
  const queueUrl = overrides.queueUrl ?? env.awsSqsDocumentQueueUrl;
  const region = overrides.region ?? env.awsRegion;
  if (!region || typeof queueUrl !== "string" || !queueUrl.trim()) {
    throw new Error("Document processing queue is not configured");
  }
  return queueUrl;
}

export async function handleDocumentQueueMessage(message, overrides = {}) {
  if (typeof message?.ReceiptHandle !== "string" || !message.ReceiptHandle) {
    throw new DocumentQueueMessageError("SQS message is missing its receipt handle");
  }
  const job = parseDocumentProcessingMessage(message.Body);
  const processor = overrides.processor ?? processDocumentJob;
  const result = await processor(job, overrides.database ?? prisma);

  const client = overrides.client ?? sqsClient;
  const queueUrl = queueConfiguration(overrides);
  await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));

  console.log(
    `Document job handled: documentId=${job.documentId} organizationId=${job.organizationId} outcome=${result.outcome} status=${result.status ?? "missing"}`,
  );
  return { job, result };
}

function wait(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

export async function runDocumentWorker(overrides = {}) {
  const client = overrides.client ?? sqsClient;
  const database = overrides.database ?? prisma;
  const signal = overrides.signal;
  const queueUrl = queueConfiguration(overrides);
  console.log("ResolveAI document worker started");

  try {
    while (!signal?.aborted) {
      let response;
      try {
        response = await client.send(new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          WaitTimeSeconds: 20,
          MaxNumberOfMessages: 5,
          AttributeNames: ["ApproximateReceiveCount"],
        }), signal ? { abortSignal: signal } : undefined);
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") break;
        console.error(`SQS receive failed: ${error?.name || "UnknownError"}`);
        await wait(5_000, signal);
        continue;
      }

      for (const message of response.Messages ?? []) {
        try {
          await handleDocumentQueueMessage(message, { client, database, queueUrl, region: overrides.region });
        } catch (error) {
          const kind = error instanceof DocumentQueueMessageError ? "invalid" : "transient";
          console.error(
            `Document queue message ${kind} failure: messageId=${message.MessageId || "unknown"} receiveCount=${message.Attributes?.ApproximateReceiveCount || "unknown"} error=${error?.name || "Error"}`,
          );
          // Do not delete failures. SQS visibility timeout and the DLQ redrive policy retry them.
        }
      }
    }
  } finally {
    await database.$disconnect();
    client.destroy?.();
    console.log("ResolveAI document worker stopped cleanly");
  }
}

async function main() {
  const controller = new AbortController();
  const shutdown = (signal) => {
    console.log(`${signal} received. Stopping document worker...`);
    controller.abort();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  await runDocumentWorker({ signal: controller.signal });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Document worker stopped unexpectedly: ${error?.message || "Unknown error"}`);
    process.exitCode = 1;
  });
}

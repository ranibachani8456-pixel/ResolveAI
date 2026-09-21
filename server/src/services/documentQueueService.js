import { SendMessageCommand } from "@aws-sdk/client-sqs";
import sqsClient from "../config/sqs.js";
import { env } from "../config/env.js";

export const DOCUMENT_PROCESSING_EVENT_TYPE = "DOCUMENT_PROCESSING_REQUESTED";
export const DOCUMENT_PROCESSING_EVENT_VERSION = 1;
const MYSQL_INT_MAX = 2_147_483_647;

export class DocumentQueueMessageError extends Error {
  constructor(message) {
    super(message);
    this.name = "DocumentQueueMessageError";
  }
}

function requireDatabaseId(value, fieldName) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MYSQL_INT_MAX) {
    throw new DocumentQueueMessageError(`${fieldName} must be a valid positive database ID`);
  }
  return value;
}

export function createDocumentProcessingMessage({ documentId, organizationId }) {
  return {
    type: DOCUMENT_PROCESSING_EVENT_TYPE,
    version: DOCUMENT_PROCESSING_EVENT_VERSION,
    documentId: requireDatabaseId(documentId, "documentId"),
    organizationId: requireDatabaseId(organizationId, "organizationId"),
  };
}

export function parseDocumentProcessingMessage(body) {
  if (typeof body !== "string" || !body.trim()) {
    throw new DocumentQueueMessageError("SQS message body must be JSON text");
  }

  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new DocumentQueueMessageError("SQS message body is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DocumentQueueMessageError("SQS message must be a JSON object");
  }
  const expectedKeys = ["documentId", "organizationId", "type", "version"];
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new DocumentQueueMessageError("SQS message contains missing or unsupported fields");
  }
  if (value.type !== DOCUMENT_PROCESSING_EVENT_TYPE) {
    throw new DocumentQueueMessageError("Unsupported document-processing event type");
  }
  if (value.version !== DOCUMENT_PROCESSING_EVENT_VERSION) {
    throw new DocumentQueueMessageError("Unsupported document-processing event version");
  }

  return createDocumentProcessingMessage(value);
}

export async function enqueueDocumentProcessing(job, overrides = {}) {
  const client = overrides.client ?? sqsClient;
  const queueUrl = overrides.queueUrl ?? env.awsSqsDocumentQueueUrl;
  const region = overrides.region ?? env.awsRegion;
  if (!region || typeof queueUrl !== "string" || !queueUrl.trim()) {
    throw new Error("Document processing queue is not configured");
  }

  const message = createDocumentProcessingMessage(job);
  await client.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  }));
  return message;
}

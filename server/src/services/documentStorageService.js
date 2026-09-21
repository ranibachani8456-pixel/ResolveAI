import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import s3Client from "../config/s3.js";
import { MAX_DOCUMENT_SIZE_BYTES } from "../utils/documentLimits.js";
import { PermanentDocumentError } from "./documentProcessingErrors.js";

function isMissingObject(error) {
  return error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

export async function bodyToBuffer(body, maximumBytes = MAX_DOCUMENT_SIZE_BYTES) {
  if (!body) throw new PermanentDocumentError("Stored document has no content");
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const buffer = Buffer.from(body);
    if (buffer.length > maximumBytes) throw new PermanentDocumentError("Stored document exceeds the upload limit");
    return buffer;
  }

  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let total = 0;
    for await (const chunk of body) {
      const buffer = Buffer.from(chunk);
      total += buffer.length;
      if (total > maximumBytes) throw new PermanentDocumentError("Stored document exceeds the upload limit");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  if (typeof body.transformToByteArray === "function") {
    const buffer = Buffer.from(await body.transformToByteArray());
    if (buffer.length > maximumBytes) throw new PermanentDocumentError("Stored document exceeds the upload limit");
    return buffer;
  }
  throw new PermanentDocumentError("Stored document body cannot be read");
}

export async function downloadDocument(document, overrides = {}) {
  if (!document.storageKey || typeof document.storageKey !== "string") {
    throw new PermanentDocumentError("Document storage metadata is invalid");
  }
  const bucket = overrides.bucket ?? env.awsS3Bucket;
  const region = overrides.region ?? env.awsRegion;
  const client = overrides.client ?? s3Client;
  if (!bucket || !region) throw new Error("S3 worker configuration is missing");

  let response;
  try {
    response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: document.storageKey }));
  } catch (error) {
    if (isMissingObject(error)) throw new PermanentDocumentError("Stored document object does not exist");
    throw error;
  }
  if (Number(response.ContentLength) > MAX_DOCUMENT_SIZE_BYTES) {
    throw new PermanentDocumentError("Stored document exceeds the upload limit");
  }
  const buffer = await bodyToBuffer(response.Body);
  if (!buffer.length) throw new PermanentDocumentError("Stored document is empty");
  return buffer;
}

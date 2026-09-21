import { TextDecoder } from "node:util";
import { PDFParse } from "pdf-parse";
import { PermanentDocumentError } from "./documentProcessingErrors.js";

export function normalizeDocumentText(value) {
  if (typeof value !== "string") throw new PermanentDocumentError("Extracted document text is invalid");
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, "\n\n")
    .trim();
}

function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new PermanentDocumentError("Plain-text document is not valid UTF-8");
  }
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText({ pageJoiner: "\n\n" })).text;
  } catch {
    throw new PermanentDocumentError("PDF document could not be parsed");
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export async function extractDocumentText(document, buffer, overrides = {}) {
  let extracted;
  if (document.mimeType === "text/plain") {
    extracted = decodeText(buffer);
  } else if (document.mimeType === "application/pdf") {
    extracted = await (overrides.pdfExtractor ?? extractPdf)(buffer);
  } else {
    throw new PermanentDocumentError("Stored document MIME type is unsupported");
  }
  const normalized = normalizeDocumentText(extracted);
  if (!normalized) {
    throw new PermanentDocumentError(
      document.mimeType === "application/pdf"
        ? "PDF contains no extractable text; OCR is not available"
        : "Document contains no usable text",
    );
  }
  return normalized;
}

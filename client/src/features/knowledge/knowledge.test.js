import { shouldPollDocuments, validateDocumentFile } from "./KnowledgePage.jsx";

test("document validation matches the backend's supported types and size", () => {
  expect(validateDocumentFile(new File(["policy"], "policy.txt", { type: "text/plain" }))).toBe("");
  expect(validateDocumentFile(new File(["image"], "image.png", { type: "image/png" }))).toMatch(/Only PDF/);
  const oversized = { name: "large.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 };
  expect(validateDocumentFile(oversized)).toMatch(/10 MB/);
});

test("polling continues only while a document is non-terminal", () => {
  expect(shouldPollDocuments([{ status: "PENDING" }])).toBe(true);
  expect(shouldPollDocuments([{ status: "PROCESSING" }])).toBe(true);
  expect(shouldPollDocuments([{ status: "READY" }, { status: "FAILED" }])).toBe(false);
});

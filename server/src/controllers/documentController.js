import {
  DocumentServiceError,
  getDocument,
  getDocumentContent,
  listDocuments,
  uploadDocument,
} from "../services/documentService.js";

function handleDocumentError(error, response) {
  if (error instanceof DocumentServiceError) {
    return response.status(error.statusCode).json({ success: false, message: error.message });
  }
  console.error("Unexpected document request error", error);
  return response.status(500).json({ success: false, message: "Unable to complete document request" });
}

export async function uploadNewDocument(request, response) {
  try {
    const document = await uploadDocument(request.user.organizationId, request.file);
    return response.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: { document },
    });
  } catch (error) {
    return handleDocumentError(error, response);
  }
}

export async function getDocuments(request, response) {
  try {
    const documents = await listDocuments(request.user.organizationId);
    return response.status(200).json({ success: true, data: { documents } });
  } catch (error) {
    return handleDocumentError(error, response);
  }
}

export async function getDocumentById(request, response) {
  try {
    const document = await getDocument(request.user.organizationId, request.params.documentId);
    return response.status(200).json({ success: true, data: { document } });
  } catch (error) {
    return handleDocumentError(error, response);
  }
}

export async function previewDocument(request, response) {
  try {
    const content = await getDocumentContent(
      request.user.organizationId,
      request.params.documentId,
      request.app?.locals?.documentPreviewStorage,
    );
    const fallbackName = content.fileName
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    const encodedName = encodeURIComponent(content.fileName)
      .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    response.set({
      "Content-Type": content.mimeType,
      "Content-Length": String(content.buffer.length),
      "Content-Disposition": `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return response.status(200).send(content.buffer);
  } catch (error) {
    return handleDocumentError(error, response);
  }
}

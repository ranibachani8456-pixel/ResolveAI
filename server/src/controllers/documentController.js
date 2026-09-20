import { DocumentServiceError, getDocument, listDocuments, uploadDocument } from "../services/documentService.js";

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

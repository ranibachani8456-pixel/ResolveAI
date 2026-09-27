import { apiBlobRequest, apiRequest } from "./client.js";

export const documentApi = {
  list: (signal) => apiRequest("/documents", { signal }),
  get: (documentId, signal) => apiRequest(`/documents/${documentId}`, { signal }),
  preview: (documentId, signal) => apiBlobRequest(`/documents/${documentId}/content`, { signal }),
  upload: (file, signal) => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest("/documents", { method: "POST", body, signal });
  },
};

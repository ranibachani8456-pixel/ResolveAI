import { apiRequest } from "./client.js";

export const documentApi = {
  list: (signal) => apiRequest("/documents", { signal }),
  get: (documentId, signal) => apiRequest(`/documents/${documentId}`, { signal }),
  upload: (file, signal) => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest("/documents", { method: "POST", body, signal });
  },
};

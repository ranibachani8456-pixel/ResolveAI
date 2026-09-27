import { apiRequest } from "./client.js";

export const aiApi = {
  listConversations: (signal) => apiRequest("/ai/conversations", { signal }),
  createConversation: (title, signal) => apiRequest("/ai/conversations", {
    method: "POST", body: title ? { title } : {}, signal,
  }),
  getConversation: (conversationId, signal) => apiRequest(`/ai/conversations/${conversationId}`, { signal }),
  sendMessage: (conversationId, question, signal) => apiRequest(
    `/ai/conversations/${conversationId}/messages`,
    { method: "POST", body: { question }, signal },
  ),
};

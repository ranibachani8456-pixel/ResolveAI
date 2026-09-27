import { apiRequest, queryString } from "./client.js";

export const ticketApi = {
  list: (filters = {}, signal) => apiRequest(`/tickets${queryString(filters)}`, { signal }),
  get: (ticketId, signal) => apiRequest(`/tickets/${ticketId}`, { signal }),
  create: (details, signal) => apiRequest("/tickets", { method: "POST", body: details, signal }),
  update: (ticketId, details, signal) => apiRequest(`/tickets/${ticketId}`, {
    method: "PATCH", body: details, signal,
  }),
  messages: (ticketId, signal) => apiRequest(`/tickets/${ticketId}/messages`, { signal }),
  sendMessage: (ticketId, content, signal) => apiRequest(`/tickets/${ticketId}/messages`, {
    method: "POST", body: { content }, signal,
  }),
};

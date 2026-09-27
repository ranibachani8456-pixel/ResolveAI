import { apiRequest } from "./client.js";

export const customerApi = {
  list: (signal) => apiRequest("/customers", { signal }),
  get: (customerId, signal) => apiRequest(`/customers/${customerId}`, { signal }),
  create: (details, signal) => apiRequest("/customers", { method: "POST", body: details, signal }),
  update: (customerId, details, signal) => apiRequest(`/customers/${customerId}`, {
    method: "PATCH", body: details, signal,
  }),
};

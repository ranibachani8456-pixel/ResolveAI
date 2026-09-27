import { apiRequest } from "./client.js";

export const organizationApi = {
  get: (signal) => apiRequest("/organization", { signal }),
  users: (signal) => apiRequest("/organization/users", { signal }),
  createUser: (details, signal) => apiRequest("/organization/users", {
    method: "POST", body: details, signal,
  }),
  updateRole: (userId, role, signal) => apiRequest(`/organization/users/${userId}/role`, {
    method: "PATCH", body: { role }, signal,
  }),
};

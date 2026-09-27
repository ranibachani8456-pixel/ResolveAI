import { apiRequest } from "./client.js";

export const authApi = {
  login: (credentials, signal) => apiRequest("/auth/login", {
    method: "POST", body: credentials, auth: false, signal,
  }),
  register: (details, signal) => apiRequest("/auth/register", {
    method: "POST", body: details, auth: false, signal,
  }),
  me: (signal) => apiRequest("/auth/me", { signal }),
};

import { apiRequest } from "./client.js";

export const publicSupportApi = {
  submit: (organizationSlug, details, signal) => apiRequest(
    `/public/support/${encodeURIComponent(organizationSlug)}/tickets`,
    { method: "POST", body: details, auth: false, signal },
  ),
};

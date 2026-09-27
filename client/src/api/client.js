import { getToken } from "./tokenStorage.js";

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const API_ROOT = configuredBaseUrl
  ? `${configuredBaseUrl}${configuredBaseUrl.endsWith("/api") ? "" : "/api"}`
  : "/api";

const errorKinds = {
  400: "validation",
  401: "authentication",
  403: "permission",
  404: "not-found",
  409: "conflict",
  413: "payload-too-large",
  429: "rate-limit",
};

export class ApiError extends Error {
  constructor(message, { status = 0, kind = "network", data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.data = data;
  }
}

function fallbackMessage(status) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 409) return "That change conflicts with existing information.";
  if (status === 413) return "The selected file is too large.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  if (status >= 500) return "ResolveAI is temporarily unavailable. Please try again.";
  return "The request could not be completed.";
}

export async function apiRequest(path, options = {}) {
  const { body, headers = {}, auth = true, signal, ...requestOptions } = options;
  const token = auth ? getToken() : null;
  const isFormData = body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...requestOptions,
      signal,
      headers: {
        Accept: "application/json",
        ...(isFormData || body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: isFormData ? body : JSON.stringify(body) }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Unable to connect to ResolveAI. Check your network and try again.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Normalize malformed server responses instead of exposing raw response text.
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      window.dispatchEvent(new CustomEvent("resolveai:unauthorized"));
    }
    throw new ApiError(data?.message || fallbackMessage(response.status), {
      status: response.status,
      kind: errorKinds[response.status] || (response.status >= 500 ? "server" : "request"),
      data,
    });
  }

  return data;
}

export async function apiBlobRequest(path, options = {}) {
  const { headers = {}, auth = true, signal, ...requestOptions } = options;
  const token = auth ? getToken() : null;
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...requestOptions,
      signal,
      headers: {
        Accept: "application/pdf, text/plain",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Unable to connect to ResolveAI. Check your network and try again.");
  }

  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      // Binary endpoints still use JSON for API errors when possible.
    }
    if (response.status === 401 && auth) {
      window.dispatchEvent(new CustomEvent("resolveai:unauthorized"));
    }
    throw new ApiError(data?.message || fallbackMessage(response.status), {
      status: response.status,
      kind: errorKinds[response.status] || (response.status >= 500 ? "server" : "request"),
      data,
    });
  }

  return response.blob();
}

export function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

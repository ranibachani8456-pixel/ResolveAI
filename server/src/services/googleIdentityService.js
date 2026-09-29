import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

const googleClient = new OAuth2Client();

export class GoogleIdentityConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleIdentityConfigurationError";
  }
}

export class GoogleCredentialError extends Error {
  constructor(message = "Google credential could not be verified") {
    super(message);
    this.name = "GoogleCredentialError";
  }
}

export async function verifyGoogleCredential(credential, overrides = {}) {
  const clientId = overrides.clientId ?? env.googleClientId;
  const client = overrides.client ?? googleClient;
  if (!clientId || !clientId.trim()) {
    throw new GoogleIdentityConfigurationError("GOOGLE_CLIENT_ID is not configured");
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    // Provider errors can contain token details. Collapse them into one safe boundary error.
    throw new GoogleCredentialError();
  }

  if (
    !payload || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 191 ||
    payload.email_verified !== true || typeof payload.email !== "string"
  ) {
    throw new GoogleCredentialError();
  }

  return {
    providerSubject: payload.sub,
    email: payload.email,
  };
}

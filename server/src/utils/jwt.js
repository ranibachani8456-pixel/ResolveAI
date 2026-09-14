import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const ALLOWED_ROLES = new Set(["OWNER", "ADMIN", "SUPPORT_AGENT", "VIEWER"]);

export class JwtConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "JwtConfigurationError";
  }
}

export function assertJwtConfiguration() {
  if (!env.jwtSecret || env.jwtSecret.trim().length < 32) {
    throw new JwtConfigurationError("JWT_SECRET must contain at least 32 characters");
  }

  if (!env.jwtExpiresIn || !env.jwtExpiresIn.trim()) {
    throw new JwtConfigurationError("JWT_EXPIRES_IN is not configured");
  }
}

export function signJwt({ userId, organizationId, role }) {
  assertJwtConfiguration();

  // Only tenant identity and role are included as application claims.
  return jwt.sign({ userId, organizationId, role }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyJwt(token) {
  assertJwtConfiguration();

  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });

  if (
    typeof payload !== "object" ||
    !Number.isInteger(payload.userId) ||
    !Number.isInteger(payload.organizationId) ||
    !ALLOWED_ROLES.has(payload.role)
  ) {
    throw new Error("Invalid authentication token claims");
  }

  // Return only the identity fields that downstream handlers are allowed to trust.
  return {
    userId: payload.userId,
    organizationId: payload.organizationId,
    role: payload.role,
  };
}

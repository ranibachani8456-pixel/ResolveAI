import { JwtConfigurationError, verifyJwt } from "../utils/jwt.js";
import prisma from "../config/prisma.js";

export async function authMiddleware(request, response, next) {
  const authorization = request.get("Authorization");

  if (!authorization) {
    return response.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const bearerMatch = authorization.trim().match(/^Bearer ([^\s]+)$/i);

  if (!bearerMatch) {
    return response.status(401).json({
      success: false,
      message: "A valid Bearer token is required",
    });
  }

  let identity;
  try {
    identity = verifyJwt(bearerMatch[1]);
  } catch (error) {
    if (error instanceof JwtConfigurationError) {
      console.error(`Authentication configuration error: ${error.message}`);
      return response.status(500).json({
        success: false,
        message: "Authentication service is not configured",
      });
    }

    return response.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }

  try {
    // Refresh membership and role so removed users and stale role claims cannot grant access.
    const user = await prisma.user.findFirst({
      where: { id: identity.userId, organizationId: identity.organizationId },
      select: { id: true, organizationId: true, role: true },
    });

    if (!user) {
      return response.status(401).json({ success: false, message: "Authentication required" });
    }

    request.user = { userId: user.id, organizationId: user.organizationId, role: user.role };
    return next();
  } catch (error) {
    console.error("Unable to verify current organization membership", error);
    return response.status(503).json({
      success: false,
      message: "Authentication service is temporarily unavailable",
    });
  }
}

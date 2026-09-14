import { JwtConfigurationError, verifyJwt } from "../utils/jwt.js";

export function authMiddleware(request, response, next) {
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

  try {
    request.user = verifyJwt(bearerMatch[1]);
    return next();
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
}

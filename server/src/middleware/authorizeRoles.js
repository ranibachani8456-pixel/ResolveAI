import { Role } from "@prisma/client";

const VALID_ROLES = new Set(Object.values(Role));

export function authorizeRoles(...allowedRoles) {
  if (!allowedRoles.length || allowedRoles.some((role) => !VALID_ROLES.has(role))) {
    throw new Error("authorizeRoles must be configured with valid roles");
  }

  const allowedRoleSet = new Set(allowedRoles);

  return function roleAuthorizationMiddleware(request, response, next) {
    // Authentication must establish req.user before authorization runs.
    if (!request.user) {
      return response.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoleSet.has(request.user.role)) {
      return response.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    return next();
  };
}

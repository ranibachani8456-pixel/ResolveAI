export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  VIEWER: "VIEWER",
};

export const WRITE_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN, ROLES.SUPPORT_AGENT]);
export const TEAM_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);
export const DOCUMENT_UPLOAD_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);

export function canWrite(role) {
  return WRITE_ROLES.has(role);
}

export function canManageTeam(role) {
  return TEAM_ROLES.has(role);
}

export function canUploadDocuments(role) {
  return DOCUMENT_UPLOAD_ROLES.has(role);
}

export function roleLabel(role) {
  return role === ROLES.SUPPORT_AGENT
    ? "Support agent"
    : role?.charAt(0) + role?.slice(1).toLowerCase();
}

import type { StaffRole } from "@prisma/client";

export type Permission =
  | "staff:read"
  | "staff:write"
  | "listings:read"
  | "listings:write"
  | "contacts:read"
  | "contacts:write"
  | "suppression:read"
  | "suppression:write"
  | "campaigns:read"
  | "campaigns:write"
  | "inbox:read"
  | "inbox:write"
  | "privacy:admin";

const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  ADMIN: [
    "staff:read",
    "staff:write",
    "listings:read",
    "listings:write",
    "contacts:read",
    "contacts:write",
    "suppression:read",
    "suppression:write",
    "campaigns:read",
    "campaigns:write",
    "inbox:read",
    "inbox:write",
    "privacy:admin",
  ],
  CAMPAIGN_MANAGER: [
    "listings:read",
    "listings:write",
    "contacts:read",
    "contacts:write",
    "suppression:read",
    "suppression:write",
    "campaigns:read",
    "campaigns:write",
    "inbox:read",
  ],
  SUPPORT_AGENT: [
    "listings:read",
    "contacts:read",
    "contacts:write",
    "suppression:read",
    "inbox:read",
    "inbox:write",
  ],
  VIEWER: ["listings:read", "contacts:read", "suppression:read", "campaigns:read"],
};

export function permissionsForRole(role: StaffRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

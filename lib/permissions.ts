import type { Permission, Role } from "@/types";

export const ALL_PERMISSIONS: Permission[] = [
  "ticket.create",
  "ticket.view",
  "ticket.update",
  "ticket.assign",
  "ticket.delete",
  "ticket.close",
  "user.view",
  "user.create",
  "user.update",
  "user.delete",
  "knowledge.view",
  "knowledge.create",
  "knowledge.update",
  "knowledge.delete",
  "ai.manage",
  "ai.train",
  "ai.sources.manage",
  "analytics.view",
  "settings.manage",
  "department.manage",
  "meeting.manage",
  "chat.agent",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CUSTOMER: [
    "ticket.create",
    "ticket.view",
    "knowledge.view",
  ],
  AGENT: [
    "ticket.create",
    "ticket.view",
    "ticket.update",
    "ticket.assign",
    "ticket.close",
    "knowledge.view",
    "knowledge.create",
    "knowledge.update",
    "chat.agent",
    "meeting.manage",
  ],
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== "user.delete"),
  SUPER_ADMIN: [...ALL_PERMISSIONS],
};

export function hasPermission(role: Role | undefined, permission: Permission) {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyRole(role: Role | undefined, roles: Role[]) {
  if (!role) return false;
  return roles.includes(role);
}

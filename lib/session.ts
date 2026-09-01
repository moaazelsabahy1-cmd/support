import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/api-response";
import { hasPermission } from "@/lib/permissions";
import type { Permission, Role, SessionUser } from "@/types";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;
  const user = session.user as SessionUser & { id: string };
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: (user.role as Role) || "CUSTOMER",
    departmentId: user.departmentId ?? null,
    status: user.status || "ACTIVE",
    image: user.image,
  };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "You must be signed in", 401);
  }
  if (user.status === "DEACTIVATED") {
    throw new AppError("ACCOUNT_DISABLED", "This account is deactivated", 403);
  }
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!hasPermission(user.role, permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do that", 403);
  }
  return user;
}

export async function requireRoles(roles: Role[]) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && !roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "Insufficient role", 403);
  }
  return user;
}

export async function requirePageUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status === "DEACTIVATED") redirect("/login?error=disabled");
  return user;
}

export function homeForRole(role: Role) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "/admin";
  if (role === "AGENT") return "/agent";
  return "/dashboard";
}

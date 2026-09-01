"use server";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api-response";
import { requirePermission, requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { userCreateSchema } from "@/lib/validation";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/utils";
import type { Prisma, Role } from "@prisma/client";

export async function listUsersAction(filters: { role?: Role; q?: string; page?: number; pageSize?: number }) {
  await requirePermission("user.view");
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role;
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, status: true, departmentId: true, createdAt: true, image: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return serialize({ items, total, page, pageSize });
}

export async function createUserAction(input: unknown) {
  await requirePermission("user.create");
  const data = userCreateSchema.parse(input);
  try {
    await auth.api.signUpEmail({
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
      },
    });
  } catch (error) {
    throw new AppError("USER_CREATE", error instanceof Error ? error.message : "Could not create user", 400);
  }
  await prisma.user.update({
    where: { email: data.email },
    data: {
      role: data.role,
      departmentId: data.departmentId || null,
      phone: data.phone ?? null,
      status: "ACTIVE",
    },
  });
  await sendEmail({
    to: data.email,
    subject: "Welcome to Solvio",
    template: "welcome",
    data: { name: data.name, url: appUrl("/login") },
  });
  return { ok: true };
}

export async function updateUserAction(
  id: string,
  input: { role?: Role; status?: "ACTIVE" | "DEACTIVATED"; departmentId?: string | null; name?: string; phone?: string },
) {
  const actor = await requirePermission("user.update");
  if (input.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "Only super admins can grant that role", 403);
  }
  await prisma.user.update({
    where: { id },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
  return { ok: true };
}

export async function deleteUserAction(id: string) {
  const actor = await requirePermission("user.delete");
  if (actor.id === id) throw new AppError("FORBIDDEN", "You cannot delete yourself", 403);
  await prisma.user.delete({ where: { id } });
  return { ok: true };
}

export async function updateProfileAction(input: { name?: string; phone?: string; image?: string }) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.image !== undefined ? { image: input.image, avatarUrl: input.image } : {}),
    },
  });
  return { ok: true };
}

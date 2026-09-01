"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { departmentSchema } from "@/lib/validation";
import { serialize } from "@/lib/serialize";
import { slugify } from "@/lib/utils";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";

export async function listDepartmentsAction() {
  await requirePermission("ticket.view");
  return serialize(await prisma.department.findMany({ orderBy: { name: "asc" } }));
}

export async function createDepartmentAction(input: unknown) {
  await requirePermission("department.manage");
  const data = departmentSchema.parse(input);
  if (data.isDefault) {
    await prisma.department.updateMany({ data: { isDefault: false } });
  }
  const created = await prisma.department.create({
    data: {
      id: newId(),
      name: data.name,
      slug: slugify(data.name),
      description: data.description,
      isDefault: data.isDefault,
      slaFirstResponseMinutes: data.slaFirstResponseMinutes,
      slaResolveMinutes: data.slaResolveMinutes,
    },
  });
  return serialize(created);
}

export async function updateDepartmentAction(id: string, input: unknown) {
  await requirePermission("department.manage");
  const data = departmentSchema.partial().parse(input);
  if (data.isDefault) {
    await prisma.department.updateMany({ data: { isDefault: false } });
  }
  await prisma.department.update({
    where: { id },
    data: {
      ...data,
      ...(data.name ? { slug: slugify(data.name) } : {}),
    },
  });
  return { ok: true };
}

export async function deleteDepartmentAction(id: string) {
  await requirePermission("department.manage");
  const count = await prisma.ticket.count({ where: { departmentId: id } });
  if (count > 0) throw new AppError("IN_USE", "Department has tickets", 400);
  await prisma.department.delete({ where: { id } });
  return { ok: true };
}

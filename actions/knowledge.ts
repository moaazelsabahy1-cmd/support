"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { articleSchema } from "@/lib/validation";
import { serialize } from "@/lib/serialize";
import { slugify } from "@/lib/utils";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import type { Prisma } from "@prisma/client";

export async function listArticlesAction(opts?: { q?: string; publishedOnly?: boolean }) {
  if (!opts?.publishedOnly) {
    await requirePermission("knowledge.create");
  }
  const where: Prisma.KbArticleWhereInput = {};
  if (opts?.publishedOnly) where.published = true;
  if (opts?.q) {
    where.OR = [
      { title: { contains: opts.q, mode: "insensitive" } },
      { body: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  const [items, categories] = await Promise.all([
    prisma.kbArticle.findMany({ where, orderBy: [{ featured: "desc" }, { updatedAt: "desc" }] }),
    prisma.kbCategory.findMany(),
  ]);
  return serialize({ items, categories });
}

export async function getArticleBySlugAction(slug: string) {
  const article = await prisma.kbArticle.findFirst({ where: { slug, published: true } });
  if (!article) throw new AppError("NOT_FOUND", "Article not found", 404);
  const [category, related] = await Promise.all([
    prisma.kbCategory.findUnique({ where: { id: article.categoryId } }),
    prisma.kbArticle.findMany({
      where: { categoryId: article.categoryId, published: true, id: { not: article.id } },
      take: 4,
    }),
  ]);
  return serialize({ article, category, related });
}

export async function upsertArticleAction(id: string | null, input: unknown) {
  const user = await requirePermission(id ? "knowledge.update" : "knowledge.create");
  const data = articleSchema.parse(input);
  const slug = slugify(data.title);
  if (id) {
    await prisma.kbArticle.update({
      where: { id },
      data: { ...data, categoryId: data.categoryId, slug },
    });
    return { id, slug };
  }
  const created = await prisma.kbArticle.create({
    data: {
      id: newId(),
      ...data,
      categoryId: data.categoryId,
      slug,
      authorId: user.id,
    },
  });
  return { id: created.id, slug };
}

export async function deleteArticleAction(id: string) {
  await requirePermission("knowledge.delete");
  await prisma.kbArticle.delete({ where: { id } });
  return { ok: true };
}

export async function upsertCategoryAction(input: { id?: string; name: string; description?: string }) {
  await requirePermission("knowledge.create");
  const slug = slugify(input.name);
  if (input.id) {
    await prisma.kbCategory.update({
      where: { id: input.id },
      data: { name: input.name, description: input.description, slug },
    });
    return { id: input.id };
  }
  const created = await prisma.kbCategory.create({
    data: { id: newId(), name: input.name, slug, description: input.description },
  });
  return { id: created.id };
}

export async function deleteCategoryAction(id: string) {
  await requirePermission("knowledge.delete");
  const count = await prisma.kbArticle.count({ where: { categoryId: id } });
  if (count) throw new AppError("IN_USE", "Category has articles", 400);
  await prisma.kbCategory.delete({ where: { id } });
  return { ok: true };
}

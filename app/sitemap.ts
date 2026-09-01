import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: appUrl("/"), lastModified: new Date() },
    { url: appUrl("/knowledge-base"), lastModified: new Date() },
    { url: appUrl("/login"), lastModified: new Date() },
  ];
  try {
    const { prisma } = await import("@/lib/db");
    const articles = await prisma.kbArticle.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    });
    for (const a of articles) {
      entries.push({
        url: appUrl(`/knowledge-base/${a.slug}`),
        lastModified: a.updatedAt,
      });
    }
  } catch {
    // Postgres may be unavailable at build time.
  }
  return entries;
}

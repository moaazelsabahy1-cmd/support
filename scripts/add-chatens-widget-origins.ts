import { prisma } from "../lib/prisma";

async function main() {
  const extra = ["https://chatens.com", "https://www.chatens.com"];
  const sites = await prisma.widgetSite.findMany({ select: { id: true, allowedOrigins: true } });
  for (const s of sites) {
    const next = [...new Set([...(s.allowedOrigins || []), ...extra])];
    await prisma.widgetSite.update({ where: { id: s.id }, data: { allowedOrigins: next } });
    console.log("origins_before", (s.allowedOrigins || []).length, "after", next.length);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("failed", err instanceof Error ? err.message : "error");
  process.exit(1);
});

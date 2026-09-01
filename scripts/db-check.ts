import { prisma } from "../lib/prisma";

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log("PostgreSQL ping ok");
  console.log("Tables", tables.map((t) => t.tablename).join(", ") || "(none)");
  process.exit(0);
}

main().catch((err) => {
  console.error("Database check failed", err);
  process.exit(1);
});

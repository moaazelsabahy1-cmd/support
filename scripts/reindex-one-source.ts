import { ingestSource } from "../lib/ai/ingest";
import { prisma } from "../lib/db";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: tsx scripts/reindex-one-source.ts <sourceId>");
    process.exit(1);
  }
  const source = await prisma.knowledgeSource.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, question: true },
  });
  if (!source) {
    console.error("source not found", id);
    process.exit(1);
  }
  console.log("reindexing", source.id, source.status, source.type);
  await ingestSource(id);
  const ready = await prisma.knowledgeSource.findUnique({
    where: { id },
    select: { status: true, chunkCount: true, embeddingDims: true },
  });
  console.log("done", ready);
}

void main();
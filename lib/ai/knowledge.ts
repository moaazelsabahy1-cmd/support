import { chunkDocument, chunkText, qaKnowledgeChunks, qaIntentAliases } from "@/lib/ai/chunking";
import { ingestSource } from "@/lib/ai/ingest";

export { chunkText, chunkDocument, qaKnowledgeChunks, qaIntentAliases };

/** Seed/helper: index an existing knowledge source by id. */
export async function indexChunks(opts: {
  sourceType?: string;
  sourceId: string;
  texts?: string[];
  title?: string;
}) {
  await ingestSource(opts.sourceId);
}

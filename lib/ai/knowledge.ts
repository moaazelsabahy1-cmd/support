import { chunkDocument, chunkText } from "@/lib/ai/chunking";
import { ingestSource } from "@/lib/ai/ingest";

export { chunkText, chunkDocument };

/** Seed/helper: index an existing knowledge source by id. */
export async function indexChunks(opts: {
  sourceType?: string;
  sourceId: string;
  texts?: string[];
  title?: string;
}) {
  await ingestSource(opts.sourceId);
}

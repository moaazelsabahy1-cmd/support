/**
 * Read-only: print stored Q&A and retrieveKnowledge scores for create-ticket paraphrases.
 * Never logs API keys.
 */
import { prisma } from "../lib/db";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { knowledgeConfidenceThreshold } from "../lib/env";
import { DEFAULT_ORGANIZATION_ID } from "../types";

const SOURCE_ID = process.argv[2] || "b0590f53ad3b337e94baf85b";
const QUERIES = [
  "How do I create a ticket?",
  "Where can I submit a new support request?",
  "Where can I submit a new ticket?",
  "How can I open a support ticket?",
  "Where do I create a support ticket?",
  "How do I submit a ticket?",
];

async function main() {
  const threshold = knowledgeConfidenceThreshold();
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: SOURCE_ID },
    select: {
      id: true,
      status: true,
      type: true,
      title: true,
      question: true,
      answer: true,
      organizationId: true,
      metadata: true,
      chunkCount: true,
    },
  });
  console.log("threshold", threshold);
  console.log(
    "source",
    JSON.stringify(
      {
        id: source?.id,
        status: source?.status,
        type: source?.type,
        organizationId: source?.organizationId,
        title: source?.title,
        question: source?.question,
        answer: source?.answer,
        metadata: source?.metadata,
        chunkCount: source?.chunkCount,
      },
      null,
      2,
    ),
  );

  for (const query of QUERIES) {
    const retrieved = await retrieveKnowledge({
      query,
      filters: { organizationId: source?.organizationId || DEFAULT_ORGANIZATION_ID },
    });
    const hit = retrieved.hits[0];
    const same = retrieved.hits.find((h) => h.sourceId === SOURCE_ID);
    const score = same?.score ?? hit?.score ?? 0;
    const ok = score >= threshold && Boolean(same);
    console.log(
      JSON.stringify({
        query,
        topScore: hit?.score ?? null,
        topSourceId: hit?.sourceId ?? null,
        sourceScore: same?.score ?? null,
        retrievedQuestion: same?.title || hit?.title || null,
        gte75: ok,
        handoff: !ok,
      }),
    );
  }
}

void main();

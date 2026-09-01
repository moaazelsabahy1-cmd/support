export const KNOWLEDGE_ERROR = {
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  CHUNKING_FAILED: "CHUNKING_FAILED",
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  QDRANT_FAILED: "QDRANT_FAILED",
  FETCH_FAILED: "FETCH_FAILED",
  INVALID_SOURCE: "INVALID_SOURCE",
  UNSUPPORTED_FILE: "UNSUPPORTED_FILE",
  NO_TEXT_FOUND: "NO_TEXT_FOUND",
  NO_CONFIDENT_KNOWLEDGE: "NO_CONFIDENT_KNOWLEDGE",
} as const;

export type KnowledgeErrorCode = (typeof KNOWLEDGE_ERROR)[keyof typeof KNOWLEDGE_ERROR];

export class KnowledgeError extends Error {
  constructor(
    public code: KnowledgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

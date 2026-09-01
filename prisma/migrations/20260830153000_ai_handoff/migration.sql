-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('CUSTOMER', 'AI', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiHandoffReason" AS ENUM ('KNOWLEDGE_NOT_FOUND', 'LOW_RELEVANCE', 'LOW_CONFIDENCE', 'CUSTOMER_REQUESTED_HUMAN', 'BUSINESS_RULE', 'SENSITIVE_OPERATION', 'AI_ERROR');

-- AlterEnum
ALTER TYPE "IndexStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "IndexStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- AlterEnum
ALTER TYPE "KnowledgeSourceType" ADD VALUE IF NOT EXISTS 'CONVERSATION';

-- AlterTable
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "handoffReason" "AiHandoffReason";
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "aiPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "sourceSessionId" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "role" "MessageRole" NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "handoffReason" "AiHandoffReason";
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "aiTurnKey" TEXT;

-- AlterTable
ALTER TABLE "ai_chat_logs" ADD COLUMN IF NOT EXISTS "handoffReason" "AiHandoffReason";

CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversationId_aiTurnKey_key" ON "messages"("conversationId", "aiTurnKey");
CREATE INDEX IF NOT EXISTS "conversations_aiPaused_status_idx" ON "conversations"("aiPaused", "status");
CREATE INDEX IF NOT EXISTS "conversations_sourceSessionId_idx" ON "conversations"("sourceSessionId");

ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_organizationId_fkey";
ALTER TABLE "user" ADD CONSTRAINT "user_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_organizationId_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

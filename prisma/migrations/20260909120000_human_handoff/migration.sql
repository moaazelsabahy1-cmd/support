-- CreateEnum
CREATE TYPE "HumanHandoffStatus" AS ENUM ('PENDING', 'OFFERED', 'ACCEPTED', 'NO_AGENT_AVAILABLE', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AgentHandoffAttemptStatus" AS ENUM ('OFFERED', 'DECLINED', 'ACCEPTED', 'SKIPPED');

-- CreateTable
CREATE TABLE "human_handoffs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "current_agent_id" TEXT,
    "status" "HumanHandoffStatus" NOT NULL DEFAULT 'PENDING',
    "handoff_reason" "AiHandoffReason" NOT NULL,
    "current_attempt" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "human_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_handoff_attempts" (
    "id" TEXT NOT NULL,
    "handoff_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "AgentHandoffAttemptStatus" NOT NULL DEFAULT 'OFFERED',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "agent_handoff_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "human_handoffs_conversation_id_key" ON "human_handoffs"("conversation_id");
CREATE INDEX "human_handoffs_current_agent_id_status_idx" ON "human_handoffs"("current_agent_id", "status");
CREATE INDEX "human_handoffs_status_idx" ON "human_handoffs"("status");
CREATE UNIQUE INDEX "agent_handoff_attempts_handoff_id_order_key" ON "agent_handoff_attempts"("handoff_id", "order");
CREATE INDEX "agent_handoff_attempts_agent_id_status_idx" ON "agent_handoff_attempts"("agent_id", "status");

ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "human_handoffs" ADD CONSTRAINT "human_handoffs_current_agent_id_fkey" FOREIGN KEY ("current_agent_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_handoff_attempts" ADD CONSTRAINT "agent_handoff_attempts_handoff_id_fkey" FOREIGN KEY ("handoff_id") REFERENCES "human_handoffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_handoff_attempts" ADD CONSTRAINT "agent_handoff_attempts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

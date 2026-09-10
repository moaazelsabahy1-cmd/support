-- CreateEnum
CREATE TYPE "HumanHandoffEventType" AS ENUM ('HUMAN_REQUESTED', 'REQUEST_SENT', 'OFFERED', 'ACCEPTED', 'DECLINED', 'UNAVAILABLE', 'CONNECTED', 'CLOSED');

-- CreateTable
CREATE TABLE "human_handoff_events" (
    "id" TEXT NOT NULL,
    "handoff_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "type" "HumanHandoffEventType" NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "agent_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "human_handoff_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "human_handoff_events_conversation_id_created_at_idx" ON "human_handoff_events"("conversation_id", "created_at");
CREATE INDEX "human_handoff_events_agent_id_idx" ON "human_handoff_events"("agent_id");
CREATE INDEX "human_handoff_events_handoff_id_idx" ON "human_handoff_events"("handoff_id");

ALTER TABLE "human_handoff_events" ADD CONSTRAINT "human_handoff_events_handoff_id_fkey" FOREIGN KEY ("handoff_id") REFERENCES "human_handoffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "conversations_ticketId_idx" ON "conversations"("ticketId");
CREATE INDEX "conversations_updatedAt_idx" ON "conversations"("updatedAt");

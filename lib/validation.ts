import { z } from "zod";
import {
  MEETING_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@/types";
import { isHexId } from "@/lib/id";

export const objectIdString = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid id");

export function toObjectId(id: string) {
  if (!isHexId(id)) {
    throw new Error("Invalid id");
  }
  return id;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
});

export const ticketCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(20000),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
  category: z.string().optional(),
  departmentId: objectIdString.optional(),
  tags: z.array(z.string()).optional(),
});

export const ticketUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(3).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedAgentId: objectIdString.nullable().optional(),
  departmentId: objectIdString.nullable().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  csat: z.number().int().min(1).max(5).optional(),
  saveAsKnowledge: z.boolean().optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(10000),
  internal: z.boolean().default(false),
});

export const meetingSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  agentId: objectIdString.optional(),
});

export const meetingUpdateSchema = z.object({
  status: z.enum(MEETING_STATUSES).optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  agentId: objectIdString.optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const articleSchema = z.object({
  title: z.string().min(3),
  excerpt: z.string().min(3),
  body: z.string().min(3),
  categoryId: objectIdString,
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});

export const departmentSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  slaFirstResponseMinutes: z.coerce.number().int().min(5).default(60),
  slaResolveMinutes: z.coerce.number().int().min(30).default(1440),
  isDefault: z.boolean().default(false),
});

export const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"]),
  departmentId: objectIdString.optional(),
  phone: z.string().optional(),
});

export const trainingPairSchema = z.object({
  question: z.string().min(3).max(2000),
  answer: z.string().min(3).max(20000),
  enabled: z.boolean().default(true),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const knowledgeSourcePatchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  question: z.string().min(3).max(2000).optional(),
  answer: z.string().min(3).max(20000).optional(),
  enabled: z.boolean().optional(),
});

export const knowledgeListSchema = paginationSchema.extend({
  type: z.enum(["QA", "FILE", "WEB", "CONVERSATION"]).optional(),
  status: z.enum(["PENDING", "PENDING_REVIEW", "PROCESSING", "READY", "FAILED", "DISABLED", "REJECTED"]).optional(),
  category: z.string().optional(),
  /** Admin Q&A tab: manual QA plus approved conversation knowledge. */
  surface: z.enum(["qa"]).optional(),
});

export const webSourceSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(200).optional(),
  category: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const aiChatSchema = z.object({
  message: z.string().min(1).max(8000),
  sessionId: z.string().min(8),
});

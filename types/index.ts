export const ROLES = ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "WAITING_AGENT",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const MEETING_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const INDEX_STATUSES = [
  "PENDING",
  "PENDING_REVIEW",
  "PROCESSING",
  "READY",
  "FAILED",
  "DISABLED",
  "REJECTED",
] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

export const KNOWLEDGE_SOURCE_TYPES = ["QA", "FILE", "WEB", "CONVERSATION"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_CATEGORIES = [
  "Billing",
  "Technical Support",
  "Account",
  "Orders",
  "General",
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const DEFAULT_ORGANIZATION_ID = "default";
export const SYSTEM_AI_USER_ID = "aaaaaaaaaaaaaaaaaaaaaa01";
export const DEFAULT_WIDGET_SITE_ID = "widget_default";
export const DEFAULT_WIDGET_PUBLIC_KEY = "wk_dev_default";

export const AI_HANDOFF_REASONS = [
  "KNOWLEDGE_NOT_FOUND",
  "LOW_RELEVANCE",
  "LOW_CONFIDENCE",
  "CUSTOMER_REQUESTED_HUMAN",
  "BUSINESS_RULE",
  "SENSITIVE_OPERATION",
  "AI_ERROR",
] as const;
export type AiHandoffReason = (typeof AI_HANDOFF_REASONS)[number];

export const INDEX_JOB_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type IndexJobStatus = (typeof INDEX_JOB_STATUSES)[number];

export type Permission =
  | "ticket.create"
  | "ticket.view"
  | "ticket.update"
  | "ticket.assign"
  | "ticket.delete"
  | "ticket.close"
  | "user.view"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "knowledge.view"
  | "knowledge.create"
  | "knowledge.update"
  | "knowledge.delete"
  | "ai.manage"
  | "ai.train"
  | "ai.sources.manage"
  | "analytics.view"
  | "settings.manage"
  | "department.manage"
  | "meeting.manage"
  | "chat.agent";

export interface UserDoc {
  _id?: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: Role;
  departmentId?: string | null;
  status: UserStatus;
  avatarUrl?: string | null;
  phone?: string | null;
  lastSeenAt?: Date | null;
}

export interface DepartmentDoc {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  isDefault: boolean;
  slaFirstResponseMinutes: number;
  slaResolveMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketDoc {
  _id?: string;
  number: string;
  title: string;
  description: string;
  customerId: string;
  assignedAgentId?: string | null;
  departmentId?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category?: string | null;
  tags: string[];
  csat?: number | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  firstResponseAt?: Date | null;
}

export interface TicketHistoryDoc {
  _id?: string;
  ticketId: string;
  actorId: string;
  action: string;
  from?: string | null;
  to?: string | null;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

export interface CommentDoc {
  _id?: string;
  ticketId: string;
  authorId: string;
  body: string;
  internal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttachmentDoc {
  _id?: string;
  ownerId: string;
  ticketId?: string | null;
  messageId?: string | null;
  filename: string;
  mimeType: string;
  size: number;
  key: string;
  createdAt: Date;
}

export interface ConversationDoc {
  _id?: string;
  customerId: string;
  agentId?: string | null;
  ticketId?: string | null;
  status: "OPEN" | "CLOSED";
  lastMessageAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc {
  _id?: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachmentIds: string[];
  readBy: string[];
  internal?: boolean;
  createdAt: Date;
}

export interface MeetingDoc {
  _id?: string;
  customerId: string;
  agentId?: string | null;
  title: string;
  description?: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: MeetingStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KbCategoryDoc {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KbArticleDoc {
  _id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  categoryId: string;
  tags: string[];
  featured: boolean;
  published: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiTrainingPairDoc {
  _id?: string;
  question: string;
  answer: string;
  enabled: boolean;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSourceRef {
  title: string;
  type: KnowledgeSourceType | string;
  url?: string;
}

export interface AiChatLogDoc {
  _id?: string;
  userId?: string | null;
  sessionId: string;
  question?: string;
  answer?: string;
  message: string;
  response: string;
  sources: PublicSourceRef[];
  retrievalScores?: number[];
  tokens?: number;
  model?: string;
  embeddingModel?: string;
  escalated: boolean;
  fallbackUsed?: boolean;
  confidence?: number;
  createdAt: Date;
}

export interface AiFileDoc {
  _id?: string;
  filename: string;
  mimeType: string;
  size: number;
  key: string;
  status: IndexStatus | "INDEXED";
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiWebSourceDoc {
  _id?: string;
  url: string;
  title?: string;
  status: IndexStatus | "INDEXED";
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeSourceDoc {
  _id?: string;
  organizationId: string;
  type: KnowledgeSourceType;
  title: string;
  description?: string;
  status: IndexStatus;
  sourceUrl?: string;
  fileId?: string;
  storageKey?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  category?: string;
  categoryId?: string;
  tags: string[];
  question?: string;
  answer?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  indexedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  chunkCount: number;
  embeddingModel?: string;
  embeddingDims?: number;
  metadata?: {
    crawlMode?: "firecrawl" | "single_page";
    [key: string]: unknown;
  };
}

export interface KnowledgeIndexJobDoc {
  _id?: string;
  jobId: string;
  sourceId: string;
  organizationId: string;
  status: IndexJobStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  error?: string | null;
  createdAt: Date;
}

export interface AiChunkDoc {
  _id?: string;
  organizationId: string;
  sourceType: KnowledgeSourceType | "file" | "web" | "training";
  sourceId: string;
  chunkId: string;
  text: string;
  order: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  embeddingStatus?: "PENDING" | "READY" | "FAILED";
  embeddingModel?: string;
  qdrantId?: string;
  createdAt: Date;
}

export interface NotificationDoc {
  _id?: string;
  userId: string;
  title: string;
  body: string;
  href?: string;
  type: string;
  read: boolean;
  createdAt: Date;
}

export interface NewsletterSubscriberDoc {
  _id?: string;
  email: string;
  createdAt: Date;
}

export interface ContactSubmissionDoc {
  _id?: string;
  name: string;
  email: string;
  message: string;
  sessionId?: string;
  ticketNumber?: string;
  aiContext?: string;
  createdAt: Date;
}

export interface RoleDoc {
  _id?: string;
  name: Role;
  permissions: Permission[];
}

export interface PermissionDoc {
  _id?: string;
  key: Permission;
  description: string;
}

export interface PushSubscriptionDoc {
  _id?: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

export interface SettingsDoc {
  _id: string;
  appName: string;
  branding: {
    primaryColor: string;
    logoUrl?: string;
  };
  widget: {
    publicKey: string;
    allowedOrigins: string[];
    greeting: string;
  };
  integrations: {
    openaiConfigured: boolean;
    openrouterConfigured: boolean;
    qdrantConfigured: boolean;
    r2Configured: boolean;
    smtpConfigured: boolean;
    firecrawlConfigured: boolean;
    pushConfigured: boolean;
  };
  updatedAt: Date;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string | null;
  status: UserStatus;
  image?: string | null;
}

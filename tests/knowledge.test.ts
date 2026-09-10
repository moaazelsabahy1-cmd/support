import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { chunkDocument, qaKnowledgeChunks, qaIntentAliases } from "../lib/ai/chunking";
import { extractFileBuffer, extractMarkdown, extractPlainText } from "../lib/ai/extract";
import { KnowledgeError, KNOWLEDGE_ERROR } from "../lib/ai/errors";
import { assertSafeHttpUrl, isPrivateIp } from "../lib/ai/ssrf";
import { cosine } from "../lib/ai/embeddings";
import { applyMinScore, dedupeHits, rankHits, type RetrievedHit } from "../lib/ai/retrieval";
import { groundedPrompt, publicSourceLabel, detectIntent } from "../lib/ai/prompts";
import { qdrantPointId } from "../lib/ai/qdrant";
import { hasPermission } from "../lib/permissions";
import { assertSameKnowledgeOrg, knowledgeQaSurfaceWhere } from "../lib/ai/knowledge-access";
import { trainingPairSchema, webSourceSchema, knowledgeListSchema } from "../lib/validation";
import { AppError } from "../lib/api-response";
import { embeddingModelAliases, getChatModel } from "../lib/ai/providers";
import { knowledgeIsSufficient } from "../lib/ai/agent";
import { detectLanguage } from "../lib/ai/language";
import { isSolvioSpecific } from "../lib/ai/question-kind";
import { nextHandoffAttempt, MAX_HANDOFF_AGENTS, publicHandoffAgentCards } from "../lib/ai/handoff-queue";
import { sanitizeLearnedText } from "../lib/ai/sanitize-knowledge";
import { DEFAULT_ANSWER_CONFIDENCE_THRESHOLD } from "../lib/env";
import { clampKnowledgeCategory, normalizeKnowledgeTags, ticketHasLearnableContent, knowledgeReviewSourceLabel, isTrivialSupportText } from "../lib/ai/knowledge-taxonomy";

const hit = (over: Partial<RetrievedHit>): RetrievedHit => ({
  sourceId: "a",
  chunkId: "c1",
  title: "Refund Policy",
  text: "Refunds take 5 days",
  sourceType: "FILE",
  score: 0.9,
  ...over,
});

describe("chunking", () => {
  it("splits on headings and keeps overlap", () => {
    const heading = "# Billing\n\n" + "Refunds are issued to the original payment method. ".repeat(20);
    const next = "# Account\n\n" + "You can change your email from settings. ".repeat(20);
    const chunks = chunkDocument(`${heading}\n\n${next}`, 400, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].order).toBe(0);
    expect(chunks.some((c) => c.text.includes("Billing") || c.text.includes("Refunds"))).toBe(true);
  });

  it("does not create tiny fragments", () => {
    const chunks = chunkDocument("Hi", 1000, 100);
    expect(chunks.length).toBe(0);
  });

  it("embeds Q&A on the question and title separately while keeping the answer in payload text", () => {
    const chunks = qaKnowledgeChunks({
      title: "Reset password",
      question: "How do I reset my password?",
      answer: "Open the login page, click Forgot Password, then follow the email instructions.",
    });
    expect(chunks[0].embedText).toBe("How do I reset my password?");
    expect(chunks.some((c) => c.embedText === "Reset password")).toBe(true);
    expect(chunks.every((c) => !c.embedText?.includes("Forgot Password"))).toBe(true);
    expect(chunks[0].text).toContain("Question:");
    expect(chunks[0].text).toContain("Forgot Password");
    expect(chunks.every((c) => c.text === chunks[0].text)).toBe(true);
  });

  it("adds capped create/submit aliases without embedding the answer", () => {
    const aliases = qaIntentAliases("How do I create a ticket?", "How to Create a Support Ticket");
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.length).toBeLessThanOrEqual(4);
    expect(aliases.some((a) => /submit/i.test(a) && /support request|ticket/i.test(a))).toBe(true);
    expect(qaIntentAliases("How do I create a ticket?").some((a) => /where can i submit a new support request/i.test(a))).toBe(
      true,
    );
    const chunks = qaKnowledgeChunks({
      title: "How to Create a Support Ticket",
      question: "How do I create a support ticket?",
      answer: "Open Support and click Create Ticket. Then click Submit Ticket.",
    });
    expect(chunks[0].embedText).toBe("How do I create a support ticket?");
    expect(chunks.some((c) => c.embedText === "How to Create a Support Ticket")).toBe(true);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.length).toBeLessThanOrEqual(6);
    expect(chunks.every((c) => !c.embedText?.includes("Submit Ticket"))).toBe(true);
    expect(chunks.every((c) => c.text.includes("Submit Ticket"))).toBe(true);
  });

  it("adds human/agent contact aliases for the same Q&A payload", () => {
    const aliases = qaIntentAliases("How can I connect with an agent?");
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.length).toBeLessThanOrEqual(4);
    expect(aliases.some((a) => /talk to a human/i.test(a))).toBe(true);
    expect(aliases.some((a) => /contact an agent|reach support|customer service/i.test(a))).toBe(true);
    const chunks = qaKnowledgeChunks({
      question: "How can I connect with an agent?",
      answer: 'Open the chat and select "Talk to an Agent".',
    });
    expect(chunks[0].embedText).toBe("How can I connect with an agent?");
    expect(chunks.every((c) => !c.embedText?.includes("Talk to an Agent"))).toBe(true);
    expect(chunks.every((c) => c.text.includes("Talk to an Agent"))).toBe(true);
    expect(chunks.some((c) => /talk to a human/i.test(c.embedText || ""))).toBe(true);
  });
});

describe("extraction", () => {
  it("reads plain text", async () => {
    const text = await extractFileBuffer(Buffer.from("Hello knowledge base."), "text/plain", "a.txt");
    expect(text).toContain("Hello");
  });

  it("keeps markdown headings and strips links", () => {
    const text = extractMarkdown("# Policy\n\nSee [Refunds](https://example.com) for details.");
    expect(text).toContain("Policy");
    expect(text).toContain("Refunds");
    expect(text).not.toContain("https://example.com");
  });

  it("plain text trims noise", () => {
    expect(extractPlainText("  hello   \n\n\nworld  ")).toBe("hello\n\nworld");
  });

  it("rejects unsupported types", async () => {
    await expect(extractFileBuffer(Buffer.from("x"), "image/png", "x.png")).rejects.toBeInstanceOf(KnowledgeError);
  });

  it("marks invalid PDF as extraction failure", async () => {
    try {
      await extractFileBuffer(Buffer.from("%PDF-not-a-real-file"), "application/pdf", "bad.pdf");
      throw new Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(KnowledgeError);
      expect((e as KnowledgeError).code).toMatch(/EXTRACTION_FAILED|NO_TEXT_FOUND/);
    }
  });

  it("marks invalid DOCX as extraction failure", async () => {
    try {
      await extractFileBuffer(Buffer.from("not-a-docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "bad.docx");
      throw new Error("expected failure");
    } catch (e) {
      expect(e).toBeInstanceOf(KnowledgeError);
    }
  });
});

describe("SSRF", () => {
  it("allows https URLs", () => {
    expect(assertSafeHttpUrl("https://docs.example.com/help").hostname).toBe("docs.example.com");
  });

  it("blocks localhost, private IPs, and dangerous protocols", () => {
    expect(() => assertSafeHttpUrl("http://127.0.0.1/secret")).toThrow(AppError);
    expect(() => assertSafeHttpUrl("http://192.168.1.10/x")).toThrow(AppError);
    expect(() => assertSafeHttpUrl("http://169.254.169.254/latest")).toThrow(AppError);
    expect(() => assertSafeHttpUrl("file:///etc/passwd")).toThrow(AppError);
    expect(() => assertSafeHttpUrl("javascript:alert(1)")).toThrow(AppError);
    expect(() => assertSafeHttpUrl("data:text/html,hi")).toThrow(AppError);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
});

describe("retrieval ranking", () => {
  it("ranks, thresholds, and dedupes", () => {
    const ranked = rankHits([hit({ score: 0.2, chunkId: "a" }), hit({ score: 0.9, chunkId: "b" })], 1);
    expect(ranked[0].chunkId).toBe("b");
    expect(applyMinScore([hit({ score: 0.2 }), hit({ score: 0.9 })], 0.35)).toHaveLength(1);
    const dup = dedupeHits([hit({ chunkId: "x" }), hit({ chunkId: "x", score: 0.1 })]);
    expect(dup).toHaveLength(1);
  });
});

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
});

describe("grounded prompt and sources", () => {
  it("includes retrieved knowledge and refuses empty invention surface", () => {
    const msgs = groundedPrompt("What is the refund window?", [{ title: "Refund Policy", text: "Refunds take 5 days." }]);
    expect(msgs[0].content).toContain("Refunds take 5 days");
    expect(msgs[0].content).toContain("Do not invent");
    expect(msgs[0].content).toContain("Answer as general support knowledge");
    expect(msgs[0].content).toContain("Do not claim you remember this customer");
  });

  it("maps public source labels without ids", () => {
    expect(publicSourceLabel({ title: "Pair", sourceType: "QA" })).toEqual({
      title: "Verified support knowledge",
      type: "QA",
    });
    expect(publicSourceLabel({ title: "From chat", sourceType: "CONVERSATION" })).toEqual({
      title: "Verified support knowledge",
      type: "QA",
    });
    expect(publicSourceLabel({ title: "Guide.pdf", sourceType: "FILE" }).title).toBe("Guide.pdf");
    expect(publicSourceLabel({ title: "Help", sourceType: "WEB", url: "https://x.test" }).url).toBe("https://x.test");
  });
});

describe("qdrant ids", () => {
  it("are deterministic", () => {
    expect(qdrantPointId("src", "chunk-1")).toBe(qdrantPointId("src", "chunk-1"));
    expect(qdrantPointId("src", "chunk-1")).not.toBe(qdrantPointId("src", "chunk-2"));
  });
});

describe("validation and permissions", () => {
  it("validates Q&A and URLs", () => {
    expect(trainingPairSchema.safeParse({ question: "How?", answer: "Like this", enabled: true }).success).toBe(true);
    expect(trainingPairSchema.safeParse({ question: "x", answer: "y" }).success).toBe(false);
    expect(webSourceSchema.safeParse({ url: "https://example.com" }).success).toBe(true);
    expect(webSourceSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });

  it("requires admin knowledge permissions", () => {
    expect(hasPermission("CUSTOMER", "ai.sources.manage")).toBe(false);
    expect(hasPermission("AGENT", "ai.sources.manage")).toBe(false);
    expect(hasPermission("AGENT", "ai.train")).toBe(false);
    expect(hasPermission("CUSTOMER", "ai.train")).toBe(false);
    expect(hasPermission("ADMIN", "ai.train")).toBe(true);
    expect(hasPermission("ADMIN", "ai.sources.manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "ai.sources.manage")).toBe(true);
  });
});

describe("no-knowledge code", () => {
  it("exposes NO_CONFIDENT_KNOWLEDGE", () => {
    expect(KNOWLEDGE_ERROR.NO_CONFIDENT_KNOWLEDGE).toBe("NO_CONFIDENT_KNOWLEDGE");
  });
});

describe("embedding model aliases", () => {
  it("defaults chat model to google/gemini-3.7-flash", () => {
    expect(getChatModel()).toBe("google/gemini-3.7-flash");
  });

  it("treats OpenRouter and legacy OpenAI embedding slugs as compatible", () => {
    const aliases = embeddingModelAliases("openai/text-embedding-3-small");
    expect(aliases).toContain("openai/text-embedding-3-small");
    expect(aliases).toContain("text-embedding-3-small");
  });
});

describe("detectIntent", () => {
  it("escalates only on explicit human-request phrases", () => {
    expect(detectIntent("I want a human please")).toBe("escalate");
    expect(detectIntent("Can I talk to a human?")).toBe("escalate");
    expect(detectIntent("I want to talk to a human")).toBe("escalate");
    expect(detectIntent("please escalate this")).toBe("escalate");
    expect(detectIntent("connect me to an agent")).toBe("escalate");
    expect(detectIntent("Can I speak to support?")).toBe("escalate");
    expect(detectIntent("Human please")).toBe("escalate");
    expect(detectIntent("I need a real person")).toBe("escalate");
    expect(detectIntent("Talk to human")).toBe("escalate");
    expect(detectIntent("I need an agent")).toBe("escalate");
    expect(detectIntent("عايز أكلم موظف")).toBe("escalate");
    expect(detectIntent("عايز اتكلم مع حد")).toBe("escalate");
    expect(detectIntent("ممكن أكلم خدمة العملاء؟")).toBe("escalate");
    expect(detectIntent("عايز حد يساعدني")).toBe("escalate");
    expect(detectIntent("how to create account")).toBe("question");
    expect(detectIntent("What is the travel agent processing fee?")).toBe("question");
    expect(detectIntent("personal account recovery")).toBe("question");
  });
});

describe("language and question kind", () => {
  it("detects Arabic, English, and mixed messages", () => {
    expect(detectLanguage("ازاي اعمل ticket؟")).toBe("mixed");
    expect(detectLanguage("How do I create a ticket?")).toBe("en");
    expect(detectLanguage("عايز أعرف ازاي أعمل تذكرة")).toBe("ar");
  });

  it("treats VPN and HTTP as general and tickets as Solvio-specific", () => {
    expect(isSolvioSpecific("What is a VPN?")).toBe(false);
    expect(isSolvioSpecific("What is the difference between HTTP and HTTPS?")).toBe(false);
    expect(isSolvioSpecific("How do I create a ticket?")).toBe(true);
    expect(isSolvioSpecific("ازاي اعمل ticket؟")).toBe(true);
  });
});

describe("handoff queue order", () => {
  it("advances 1→2→3→4 and never wraps", () => {
    expect(MAX_HANDOFF_AGENTS).toBe(4);
    expect(nextHandoffAttempt(1, 4)).toBe(2);
    expect(nextHandoffAttempt(2, 4)).toBe(3);
    expect(nextHandoffAttempt(3, 4)).toBe(4);
    expect(nextHandoffAttempt(4, 4)).toBeNull();
    expect(nextHandoffAttempt(2, 2)).toBeNull();
  });

  it("does not wrap after Decline; selected agent decline is terminal", () => {
    const queue = readFileSync(path.join(process.cwd(), "lib/ai/handoff-queue.ts"), "utf8");
    expect(queue).not.toMatch(/nextEligibleHandoffAgent/);
    expect(queue).toMatch(/status: "NO_AGENT_AVAILABLE", currentAgentId: agentId/);
  });

  it("labels four public agent cards without emails", () => {
    const cards = publicHandoffAgentCards([
      { id: "a1", name: "Maya" },
      { id: "a2", name: "Omar" },
      { id: "a3", name: "Lin" },
      { id: "a4", name: "Sam" },
    ]);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toMatchObject({ label: "Agent 1", title: "Support Agent", ordinal: 1 });
    expect(JSON.stringify(cards)).not.toMatch(/@/);
  });
});

describe("answer confidence", () => {
  it("rejects weak retrieval as insufficient at 0.75", () => {
    expect(DEFAULT_ANSWER_CONFIDENCE_THRESHOLD).toBe(0.75);
    expect(knowledgeIsSufficient([hit({ score: 0.375 })], 0.75)).toBe(false);
    expect(knowledgeIsSufficient([hit({ score: 0.8 })], 0.75)).toBe(true);
    expect(knowledgeIsSufficient([], 0.75)).toBe(false);
  });
});

describe("knowledge taxonomy", () => {
  it("clamps unknown categories to General and keeps conversation-learn tags", () => {
    expect(clampKnowledgeCategory("Technical Support")).toBe("Technical Support");
    expect(clampKnowledgeCategory("billing")).toBe("Billing");
    expect(clampKnowledgeCategory("not-a-real-category")).toBe("General");
    expect(normalizeKnowledgeTags(["Device", "Settings"], ["conversation-learn"])).toEqual([
      "device",
      "settings",
      "conversation-learn",
    ]);
  });

  it("rejects trivial ticket threads and requires a staff solution", () => {
    expect(isTrivialSupportText("Thanks")).toBe(true);
    expect(isTrivialSupportText("please call me")).toBe(true);
    expect(
      ticketHasLearnableContent({
        title: "Hello",
        description: "Thanks",
        publicStaffComments: [{ body: "You are welcome." }],
      }),
    ).toBe(false);
    expect(
      ticketHasLearnableContent({
        title: "How do I configure feature X?",
        description: "I cannot find the setting.",
        publicStaffComments: [{ body: "Open Settings → Features → X → Enable → Save." }],
      }),
    ).toBe(true);
    expect(
      ticketHasLearnableContent({
        title: "How do I configure feature X?",
        description: "I cannot find the setting.",
        publicStaffComments: [],
      }),
    ).toBe(false);
  });

  it("labels resolved-ticket knowledge without exposing conversation fallback", () => {
    expect(knowledgeReviewSourceLabel({ sourceTicketId: "ticketabcdefghijkl" })).toBe("Resolved Ticket efghijkl");
    expect(knowledgeReviewSourceLabel({ sourceConversationId: "convabcdefghijkl" })).toBe("Resolved Chat efghijkl");
    expect(knowledgeReviewSourceLabel({ origin: "RESOLVED_CHAT", sourceConversationId: "convabcdefghijkl" })).toBe(
      "Resolved Chat efghijkl",
    );
  });
});

describe("learned knowledge sanitization", () => {
  it("redacts emails, phones, cards, and secrets", () => {
    const raw =
      "Customer  with email ahmed@example.com called +1-555-010-9999. Card 4111111111111111. Key sk-or-abcdefghijklmnop. Token Bearer abc.def. Hex 0123456789abcdef0123456789abcdef.";
    const clean = sanitizeLearnedText(raw);
    expect(clean).not.toMatch(/ahmed@example.com/i);
    expect(clean).toContain("[email]");
    expect(clean).toContain("[phone]");
    expect(clean).toContain("[card]");
    expect(clean).toContain("[api-key]");
    expect(clean).toContain("[id]");
    expect(clean).not.toContain("Bearer abc.def");
  });
});

describe("knowledge tenant access", () => {
  it("forbids cross-organization source access", () => {
    expect(() => assertSameKnowledgeOrg("org_a", "org_a")).not.toThrow();
    try {
      assertSameKnowledgeOrg("org_a", "org_b");
      throw new Error("expected forbidden");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(403);
      expect((error as AppError).code).toBe("FORBIDDEN");
    }
  });

  it("Q&A surface includes ready conversation knowledge", () => {
    expect(knowledgeListSchema.parse({ surface: "qa" }).surface).toBe("qa");
    expect(knowledgeQaSurfaceWhere()).toEqual({
      OR: [{ type: "QA" }, { type: "CONVERSATION", status: "READY" }],
    });
  });
});

import { convert } from "html-to-text";
import { getEnv, isConfigured } from "@/lib/env";
import { assertSafeFetchUrl } from "@/lib/ai/ssrf";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";
import { cleanExtractedText } from "@/lib/ai/extract";
import { aiLog, aiWarn } from "@/lib/ai/log";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;

export type WebExtractResult = {
  title: string;
  text: string;
  crawlMode: "firecrawl" | "single_page";
};

export async function extractWebsite(rawUrl: string): Promise<WebExtractResult> {
  const url = await assertSafeFetchUrl(rawUrl);
  const href = url.toString();
  const key = getEnv().FIRECRAWL_API_KEY;
  if (isConfigured(key)) {
    try {
      const Firecrawl = (await import("@mendable/firecrawl-js")).default;
      const app = new Firecrawl({ apiKey: key });
      const scraped = await app.scrape(href, { formats: ["markdown"] });
      const rec = scraped as { markdown?: string; content?: string; metadata?: { title?: string } };
      const text = cleanExtractedText(rec.markdown || rec.content || "");
      if (!text) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "Website returned no extractable text");
      aiLog("ingest", "firecrawl scrape ok", { host: url.hostname });
      return { title: rec.metadata?.title || href, text, crawlMode: "firecrawl" };
    } catch (error) {
      if (error instanceof KnowledgeError) throw error;
      aiWarn("ingest", "firecrawl failed, using single-page HTTP", { error });
    }
  }
  return fetchSinglePage(href);
}

async function fetchSinglePage(href: string): Promise<WebExtractResult> {
  const url = await assertSafeFetchUrl(href);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: ac.signal,
      headers: { "User-Agent": "SolvioKnowledgeBot/1.0", Accept: "text/html,text/plain;q=0.9" },
    });
    if (!res.ok) throw new KnowledgeError(KNOWLEDGE_ERROR.FETCH_FAILED, `Website returned HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new KnowledgeError(KNOWLEDGE_ERROR.FETCH_FAILED, "Website response is too large");
    const html = buf.toString("utf8");
    const text = cleanExtractedText(convert(html, { wordwrap: false }));
    if (!text) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "Website contained no extractable text");
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || url.toString();
    aiLog("ingest", "single-page fetch ok", { host: url.hostname });
    return { title, text, crawlMode: "single_page" };
  } catch (error) {
    if (error instanceof KnowledgeError) throw error;
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.FETCH_FAILED,
      error instanceof Error ? error.message : "Could not fetch website",
    );
  } finally {
    clearTimeout(timer);
  }
}

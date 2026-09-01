import { convert } from "html-to-text";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";

export function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractMarkdown(raw: string) {
  const kept = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/^\s*>\s?/gm, "");
  return cleanExtractedText(kept);
}

export function extractPlainText(raw: string) {
  return cleanExtractedText(raw);
}

export async function extractPdf(buf: Buffer) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    const parsed = await parser.getText();
    await parser.destroy();
    const text = cleanExtractedText(parsed.text || "");
    if (!text) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "PDF contained no extractable text");
    return text;
  } catch (error) {
    if (error instanceof KnowledgeError) throw error;
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.EXTRACTION_FAILED,
      error instanceof Error ? error.message : "PDF extraction failed",
    );
  }
}

export async function extractDocx(buf: Buffer) {
  if (buf.length < 4 || buf.subarray(0, 2).toString() !== "PK") {
    throw new KnowledgeError(KNOWLEDGE_ERROR.EXTRACTION_FAILED, "File is not a valid DOCX archive");
  }
  try {
    const mammoth = await import("mammoth");
    const html = await mammoth.convertToHtml({ buffer: buf });
    const text = cleanExtractedText(
      convert(html.value || "", {
        wordwrap: false,
        selectors: [
          { selector: "img", format: "skip" },
          { selector: "a", options: { ignoreHref: true } },
        ],
      }),
    );
    if (!text) {
      const raw = await mammoth.extractRawText({ buffer: buf });
      const fallback = cleanExtractedText(raw.value || "");
      if (!fallback) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "DOCX contained no extractable text");
      return fallback;
    }
    return text;
  } catch (error) {
    if (error instanceof KnowledgeError) throw error;
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.EXTRACTION_FAILED,
      error instanceof Error ? error.message : "DOCX extraction failed",
    );
  }
}

export async function extractFileBuffer(buf: Buffer, mime: string, filename: string) {
  const name = filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return extractPdf(buf);
  if (mime.includes("wordprocessingml") || name.endsWith(".docx")) return extractDocx(buf);
  if (mime === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown")) {
    return extractMarkdown(buf.toString("utf8"));
  }
  if (mime === "text/plain" || name.endsWith(".txt")) return extractPlainText(buf.toString("utf8"));
  throw new KnowledgeError(KNOWLEDGE_ERROR.UNSUPPORTED_FILE, "Supported files: PDF, DOCX, TXT, MD");
}

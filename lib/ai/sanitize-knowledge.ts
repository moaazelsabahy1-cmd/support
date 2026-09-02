/** Strip customer-specific and secret-like strings from learned Q&A. */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/g;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._\-]+/gi;
const SK_TOKEN = /\bsk-(?:or-)?[A-Za-z0-9]{8,}\b/g;
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/g;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;

export function sanitizeLearnedText(value: string) {
  return value
    .replace(EMAIL, "[email]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(SK_TOKEN, "[api-key]")
    .replace(AWS_KEY, "[aws-key]")
    .replace(CARD, "[card]")
    .replace(PHONE, "[phone]")
    .replace(LONG_HEX, "[id]")
    .replace(/\s{2,}/g, " ")
    .trim();
}

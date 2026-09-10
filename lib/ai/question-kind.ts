/** Heuristic: Solvio product/account vs general world knowledge. No extra LLM. */

const SOLVIO_RE =
  /\b(solvio|ticket|refund|invoice|billing|pricing|price|order|account|password|login|sign ?in|policy|policies|subscription|handoff|agent workspace|create ticket|support request|unpublished|launch date|project nebula)\b/i;

const SOLVIO_AR =
  /(تذكرة|تيكت|استرجاع|فلوس|حسابي|كلمة السر|باسورد|سياسة|فاتورة|طلب|اشتراك)/;

const GENERAL_RE =
  /\b(what is (a |an )?vpn|difference between https?|http and https|what is ssl|what is dns|what is an api)\b/i;

export function isSolvioSpecific(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (GENERAL_RE.test(t) && !SOLVIO_RE.test(t) && !SOLVIO_AR.test(t)) return false;
  if (SOLVIO_RE.test(t) || SOLVIO_AR.test(t)) return true;
  if (/^(how (do|can|to)|where (can|do)|ازاي|عايز أعرف).*(ticket|account|password|refund)/i.test(t)) return true;
  return false;
}

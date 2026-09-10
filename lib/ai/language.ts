export type DetectedLanguage = "ar" | "en" | "mixed";

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

export function detectLanguage(message: string): DetectedLanguage {
  const text = message || "";
  const hasArabic = ARABIC.test(text);
  const hasLatin = LATIN.test(text);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return "ar";
  return "en";
}

export function languagePromptLabel(detected: DetectedLanguage, fallback?: string): string {
  if (detected === "ar") return "Arabic (Egyptian or Modern Standard Arabic as the customer used)";
  if (detected === "mixed") {
    return "the customer's mixed Arabic and English; reply in the dominant language and keep product terms in English when the customer used them";
  }
  const fb = (fallback || "").trim().toLowerCase();
  if (fb && fb !== "en" && fb !== "english") return fallback as string;
  return "English";
}

export function localizedNoKnowledge(detected: DetectedLanguage) {
  if (detected === "ar") {
    return "مفيش معلومات مؤكدة كافية عندي للإجابة على السؤال ده.\nأقدر أوصلك بموظف دعم.";
  }
  return "I don't have enough verified information to answer that.\nI'll connect you with a human agent.";
}

export function localizedHumanConnect(detected: DetectedLanguage) {
  if (detected === "ar") {
    return "هوصلك بموظف دعم. استخدم زرار التحدث مع موظف عشان تفتح محادثة مباشرة.";
  }
  return "I can connect you with a human agent. Use Talk to Human to open a live conversation.";
}

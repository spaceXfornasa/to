/**
 * Language handling for Saviera.
 *
 * Three layers, from strongest to weakest:
 *  1. detectLanguage()   – decide the reply language in code (not by asking the model to guess).
 *  2. buildLanguageBlock() – put an explicit, positive "language lock" at the END of the system prompt.
 *  3. sanitizeLanguageContamination() – deterministic safety net if the model still slips.
 */

export type Language = "en" | "id" | "auto";

/** Used only when the language can't be detected from the message or recent history. */
export const DEFAULT_LANGUAGE: Exclude<Language, "auto"> = "en";

const LANGUAGE_NAME: Record<Exclude<Language, "auto">, string> = {
  en: "English",
  id: "Indonesian",
};

// Distinctive Indonesian words. Deliberately excludes words that are also common in other
// languages (e.g. "di", "ke", "ini" in Italian/Spanish contexts) to avoid false locks.
const ID_WORDS = new Set([
  "yang", "dan", "tidak", "nggak", "gak", "enggak", "bisa", "saya", "aku", "kamu", "gue", "gw",
  "lo", "lu", "anda", "kita", "kami", "mereka", "apa", "siapa", "kapan", "dimana", "berapa",
  "bagaimana", "gimana", "kenapa", "mengapa", "cara", "tolong", "mau", "udah", "sudah", "belum",
  "banget", "aja", "dong", "nih", "sih", "deh", "kok", "yg", "dgn", "untuk", "buat", "bikin",
  "pakai", "pake", "kalau", "kalo", "karena", "tapi", "atau", "dengan", "dari", "pada", "juga",
  "masih", "lagi", "bantu", "bantuin", "cariin", "carikan", "minta", "makasih", "terima", "kasih",
  "halo", "selamat", "pagi", "siang", "malam", "boleh", "jangan", "itu", "adalah", "akan",
  "bukan", "hanya", "seperti", "harga", "paket", "bayar", "lupa", "hilang", "gagal", "dulu",
  "ya", "kak", "kakak", "bang", "gan", "ngerti", "paham", "coba",
]);

// Distinctive English words. Excludes short words that collide with other languages
// ("a", "me", "no", "do", "in", "an", "so" …).
const EN_WORDS = new Set([
  "the", "and", "you", "your", "yours", "what", "how", "can", "could", "would", "should",
  "please", "thanks", "thank", "hello", "hi", "hey", "with", "this", "that", "these", "those",
  "have", "has", "had", "from", "about", "when", "where", "why", "who", "which", "there",
  "here", "just", "like", "want", "need", "help", "price", "much", "many", "does", "did",
  "doesn't", "don't", "i'm", "it's", "i", "my", "mine", "our", "they", "them", "will",
  "is", "are", "was", "were", "to", "of", "for", "not", "but", "or", "if", "it", "we", "be",
  "by", "get", "got", "know", "tell", "show", "make", "work", "works", "working", "use",
  "using", "latest", "any", "some", "all",
]);

// Tokens that appear in both languages (or are too short to mean anything) and carry no signal.
const NO_SIGNAL = new Set(["admin", "min", "i"]);

/**
 * Detects whether the user wrote in English or Indonesian.
 * Returns "auto" when unsure (other language, only code/links, or a tie) so the model can match the user.
 */
export function detectLanguage(text: string): Language {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase();

  // Mostly non-Latin script (Japanese, Arabic, Russian…) -> let the model match the user.
  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return "auto";
  const latin = cleaned.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (latin / letters < 0.6) return "auto";

  const words = cleaned.match(/[a-z']+/g) ?? [];
  let id = 0;
  let en = 0;
  for (const w of words) {
    if (NO_SIGNAL.has(w)) continue;
    if (ID_WORDS.has(w)) id += 1;
    if (EN_WORDS.has(w)) en += 1;
  }

  if (id === en) return "auto";
  const winner: Language = id > en ? "id" : "en";
  const hits = Math.max(id, en);

  // Longer text needs at least 2 distinctive hits so a stray shared word can't lock the wrong language.
  if (words.length > 4 && hits < 2) return "auto";
  return winner;
}

/**
 * Resolves the reply language: current message first, then the previous user message, else "auto".
 * Pass `currentText = ""` (e.g. attachment-only messages) to rely on history only.
 */
export function resolveLanguage(currentText: string, previousUserText = ""): Language {
  const current = currentText.trim() ? detectLanguage(currentText) : "auto";
  if (current !== "auto") return current;
  return previousUserText.trim() ? detectLanguage(previousUserText) : "auto";
}

/**
 * Positive, explicit language lock. Placed LAST in the system prompt (recency matters).
 * Note: the English block never quotes the words it forbids — naming a token in a prompt primes it.
 */
export function buildLanguageBlock(lang: Language): string {
  if (lang === "en") {
    return [
      "# LANGUAGE LOCK (this reply)",
      "The user writes English. Write the ENTIRE reply in natural, casual English, with no Indonesian words, particles or address terms, even if earlier messages, facts or search results are Indonesian. Translate them.",
    ].join("\n");
  }
  if (lang === "id") {
    return [
      "# LANGUAGE LOCK (this reply)",
      "The user writes Indonesian. Write the ENTIRE reply in natural, casual Indonesian (aku/kamu, not formal). Use \"kak\" at most ONCE per reply, only if natural. No English sentences; product names, commands and code stay as written.",
    ].join("\n");
  }
  return [
    "# LANGUAGE LOCK (this reply)",
    `Reply in the user's language; if unclear, use ${LANGUAGE_NAME[DEFAULT_LANGUAGE]}. Never mix languages in one reply, and no Indonesian address terms or particles unless the reply is Indonesian.`,
  ].join("\n");
}

/** One-line reminder used in follow-up turns (e.g. after a web search round). */
export function buildLanguageReminder(lang: Language): string {
  if (lang === "en") return "Write the reply in English only, with no Indonesian words or address terms.";
  if (lang === "id") return "Write the reply in casual Indonesian.";
  return "Write the reply in the user's language, without mixing languages.";
}

// ---------------------------------------------------------------------------------------------
// Safety net
// ---------------------------------------------------------------------------------------------

// Fenced blocks (including an unclosed trailing fence) and inline code are never touched.
const CODE_SEGMENT = /(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g;

const ADDRESS = "(?:kak|kakak)";

function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/,\s*([.?!])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
}

function stripIndonesianFromEnglish(prose: string): string {
  let out = prose;
  // Sentence-start address: "Kak, sure thing" -> "Sure thing"
  out = out.replace(
    new RegExp(`(^|[.!?]\\s+|\\n)${ADDRESS}\\b[,!]?[ \\t]*(\\S)?`, "gi"),
    (_m, pre: string, next?: string) => pre + (next ? next.toUpperCase() : ""),
  );
  // Mid-sentence or trailing address: "…projects, kak?" / "thanks kak!" / "ok kak, done"
  out = out.replace(new RegExp(`[ \\t]*,?[ \\t]*\\b${ADDRESS}\\b`, "gi"), "");
  // Trailing particles that are never English.
  out = out.replace(/[ \t]*,?[ \t]*\b(?:nih|dong|sih|deh)\b(?=\s*[.?!]|\s*$)/gi, "");
  // "ya" is only removed in the unmistakable ", ya?" position ("see ya" stays).
  out = out.replace(/,[ \t]*ya(?=\s*[.?!]|\s*$)/gi, "");
  return tidy(out);
}

function capAddressTermsInIndonesian(prose: string, state: { seen: number }): string {
  const re = new RegExp(`(?:,[ \\t]*)${ADDRESS}\\b|\\b${ADDRESS}\\b[ \\t]*,?`, "gi");
  const out = prose.replace(re, (m) => {
    state.seen += 1;
    return state.seen > 1 ? "" : m;
  });
  return tidy(out);
}

/**
 * Deterministic safety net, applied to the model's final answer.
 * - lang "en": strips Indonesian address terms/particles from prose.
 * - lang "id": keeps at most one "kak" per reply.
 * - lang "auto"/undefined: returns the text unchanged.
 * Code (fenced or inline) is never modified.
 */
export function sanitizeLanguageContamination(text: string, lang?: Language): string {
  if (lang !== "en" && lang !== "id") return text;

  const state = { seen: 0 };
  const parts = text.split(CODE_SEGMENT);
  const result = parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code segment
      return lang === "en" ? stripIndonesianFromEnglish(part) : capAddressTermsInIndonesian(part, state);
    })
    .join("");
  return result.trim();
}
/**
 * Stealth-X knowledge base for Saviera.
 *
 * Design rules:
 *  - Facts are written in plain English, one fact per bullet. The model translates them into the
 *    user's language, so Indonesian facts never leak into English replies (and vice versa).
 *  - Keywords are matched as whole words/phrases (no substring hits like "pro" inside "problem").
 *  - `keywords`     = specific terms: one hit is enough to select the entry (+3).
 *  - `weakKeywords` = generic/ambiguous terms: only count together (+1 each).
 *  - Bot identity lives in the persona (router.ts), not here.
 *  - Bump KB_VERSION whenever facts change so every conversation re-receives the overview line.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  keywords: string[];
  weakKeywords?: string[];
  facts: string[];
};

export const KB_VERSION = "2026-10-03-stealthx-7";

export const MODELS = [
  "gemma4:31b",
  "gpt-oss:120b",
  "gpt-oss:20b",
  "nemotron-3-nano:30b",
  "nemotron-3-super",
  "nemotron-3-ultra",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
] as const;

/** One-line overview injected the first time a conversation touches Stealth-X. */
export const KB_BOOTSTRAP = [
  "Stealth-X is a Roblox platform for script access, licenses, cloud scripts, and HWID resets.",
] as const;

/** Guardrails shown together with any Stealth-X facts. */
export const KB_RULES = [
  "Use ONLY the facts above for Stealth-X prices, plans, limits, menus, and policies.",
  "If the question isn't covered (refunds, bans, new scripts, delivery times, links), say you're not sure and point the user to a ticket in the official ticket channel.",
  "Never invent prices, features, links, or policies. Keep product, plan, and menu names exactly as written.",
] as const;

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: "pricing",
    title: "Plans & pricing",
    keywords: [
      "harga paket", "paket harga", "list harga", "price list", "pro plan", "plus plan",
      "basic plan", "free plan", "paket pro", "paket plus", "paket basic", "paket free",
      "pro lifetime", "stealth pro", "stealth plus",
    ],
    weakKeywords: [
      "harga", "price", "pricing", "cost", "biaya", "tarif", "paket", "plan", "plans",
      "berapa", "how much", "murah", "cheap", "pro", "plus", "basic", "free", "weekly",
      "monthly", "lifetime", "langganan",
    ],
    facts: [
      "Free: $0 / Rp0 — 1 device slot, Discord access.",
      "Basic (7 days): $1.99 / Rp15.000 — 1 slot, automatic script updates.",
      "Plus (30 days): $3.49 / Rp25.000 — 3 slots, VIP lounge, priority support.",
      "Pro (Lifetime): $6.99 / Rp80.000 — 5 slots, permanent access to all scripts, VIP role.",
    ],
  },
  {
    id: "payment",
    title: "Payment methods",
    keywords: [
      "paypal", "qris", "metode pembayaran", "payment method", "payment methods",
      "cara bayar", "cara pembayaran", "how to pay", "bukti transfer", "payment proof",
    ],
    weakKeywords: [
      "payment", "pay", "bayar", "pembayaran", "transfer", "tf", "dana", "gopay",
      "rekening", "invoice", "transaksi", "checkout", "beli", "buy", "purchase", "order",
    ],
    facts: [
      "PayPal: the plan activates automatically once payment completes.",
      "QRIS (manual): choose QRIS at checkout → join the Discord and open a ticket → an admin verifies the transfer proof → the user refreshes the dashboard.",
    ],
  },
  {
    id: "license",
    title: "License keys & loader",
    keywords: [
      "license key", "licence key", "key lisensi", "lisensi key", "invalid key", "key invalid",
      "key error", "error key", "key expired", "key hilang", "key bocor", "lost key",
      "forgot key", "lupa key", "leaked key", "stolen key", "rotate key", "key history",
      "my key", "key gue", "key saya", "key aku", "loader", "gagal inject",
    ],
    weakKeywords: [
      "license", "licence", "lisensi", "key", "kunci", "expired", "kadaluarsa", "bocor",
      "leaked", "stolen", "hilang", "lost", "lupa", "forgot", "inject", "error",
    ],
    facts: [
      "If a key errors: copy the full key, use the correct loader format, and check it hasn't expired.",
      "Lost key: log in to the dashboard → Subscription → Key History.",
      "Leaked key: rotate it from the dashboard; the old key is disabled automatically.",
    ],
  },
  {
    id: "hwid",
    title: "Devices & HWID",
    keywords: [
      "hwid", "reset hwid", "hardware id", "linked device", "linked devices", "connected devices",
      "device limit", "max device", "slot device", "slot perangkat", "reset device",
      "reset perangkat", "ganti pc", "pindah hp", "ganti device", "pindah device",
    ],
    weakKeywords: ["device", "devices", "perangkat", "slot", "lock", "pc", "hp", "reset", "cooldown"],
    facts: [
      "Reset linked devices from the \"Reset HWID\" menu in the dashboard.",
      "The reset cooldown depends on the active plan.",
      "The dashboard shows your device slots and the devices currently linked.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    keywords: [
      "dashboard", "stealth dashboard", "dashboard stealth", "menu dashboard", "cloud script",
      "cloud storage", "script storage", "key history", "session log", "activity log",
    ],
    weakKeywords: ["akun", "account", "subscription", "session", "login", "profil", "profile"],
    facts: [
      "Dashboard menus: Account Profile, Subscription, Plan Licenses, Cloud Script Storage (personal script storage/quota), Devices & Reset HWID, Connected Devices, Session & Activity Log.",
    ],
  },
  {
    id: "redeem",
    title: "Vouchers & redeem codes",
    keywords: [
      "redeem", "voucher", "tukar kode", "kode promo", "promo code", "kode voucher",
      "kupon", "coupon", "2 akun", "two accounts",
    ],
    weakKeywords: ["code", "kode", "klaim", "claim", "promo", "ban", "suspend", "suspensi"],
    facts: [
      "A voucher code can be redeemed on at most 2 different accounts.",
      "Account activity is logged; abuse can lead to account suspension or an IP ban.",
    ],
  },
  {
    id: "support",
    title: "Support",
    keywords: [
      "buka tiket", "open ticket", "open a ticket", "create ticket", "buat tiket",
      "customer service", "hubungi admin", "contact admin", "contact support",
    ],
    weakKeywords: [
      "support", "help", "bantuan", "admin", "tiket", "ticket", "komunitas", "community",
      "hubungi", "lapor", "report", "cs", "moderator",
    ],
    facts: [
      "Support is handled through tickets in the official Discord ticket channel, mainly for QRIS verification and license/technical problems.",
    ],
  },
  {
    id: "features",
    title: "What Stealth-X offers",
    keywords: [
      "apa itu stealth-x", "what is stealth-x", "stealthx itu apa", "stealth-x itu apa",
      "fitur stealth", "stealth features", "kelebihan stealth", "keunggulan",
    ],
    weakKeywords: [
      "fitur", "feature", "features", "kelebihan", "keistimewaan", "auto update",
      "auto-update", "cloud script", "benefit", "benefits", "premium",
    ],
    facts: [
      "Premium Roblox scripts, automatic script updates, personal cloud script storage, multi-device license protection, and an integrated dashboard.",
    ],
  },
];

/** Entry used when a message is clearly about Stealth-X but matches no specific topic. */
export const OVERVIEW_ENTRY: KnowledgeEntry =
  KNOWLEDGE_BASE.find((e) => e.id === "features") ?? KNOWLEDGE_BASE[0];

const STRONG_SCORE = 3;
const WEAK_SCORE = 1;
const DEFAULT_MIN_SCORE = 3;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termCache = new Map<string, RegExp>();

/** Whole-word / whole-phrase match, so "pro" does not hit "problem" and "pay" does not hit "payload". */
function hasTerm(query: string, term: string): boolean {
  let re = termCache.get(term);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term.toLowerCase())}(?![\\p{L}\\p{N}])`, "u");
    termCache.set(term, re);
  }
  return re.test(query);
}

export function scoreEntry(entry: KnowledgeEntry, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  for (const kw of entry.keywords) if (hasTerm(q, kw)) score += STRONG_SCORE;
  for (const kw of entry.weakKeywords ?? []) if (hasTerm(q, kw)) score += WEAK_SCORE;
  return score;
}

/** Ranks entries for a query. An entry needs a specific term, or several generic ones, to qualify. */
export function getRelevantKnowledge(
  query: string,
  options: { maxEntries?: number; minScore?: number } = {},
): KnowledgeEntry[] {
  const { maxEntries = 2, minScore = DEFAULT_MIN_SCORE } = options;
  if (!query.trim()) return [];

  return KNOWLEDGE_BASE.map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries)
    .map((item) => item.entry);
}

const DIRECT_BRAND_PATTERN = /\b(stealth-?x|hwid|loader|cloud script|redeem|voucher)\b/i;

/** True when the message is about Stealth-X itself (brand term, or a strong topic match). */
export function isStealthXQuery(query: string): boolean {
  if (DIRECT_BRAND_PATTERN.test(query)) return true;
  return getRelevantKnowledge(query, { maxEntries: 1 }).length > 0;
}

/** Formats matched entries as a compact, labelled block for the system prompt. */
export function formatKnowledgeForPrompt(entries: KnowledgeEntry[], isFirstScope = false): string {
  const parts: string[] = [];
  if (isFirstScope) {
    parts.push(`# STEALTH-X OVERVIEW\n- ${KB_BOOTSTRAP.join("\n- ")}`);
  }
  if (entries.length > 0) {
    const body = entries
      .map((e) => `[${e.title}]\n${e.facts.map((f) => `- ${f}`).join("\n")}`)
      .join("\n\n");
    const rules = KB_RULES.map((r) => `- ${r}`).join("\n");
    parts.push(`# STEALTH-X VERIFIED FACTS\n${body}\n\n# STEALTH-X ANSWER RULES\n${rules}`);
  }
  return parts.join("\n\n");
}

/**
 * Stealth-X customer-support knowledge for Saviera.
 *
 * Source basis: Stealth-X repository snapshot audited on 2026-10-11.
 * Dynamic production state (payments, service incidents, script availability, license status,
 * quotas, and cooldowns) must be checked at runtime; static repository facts are not live state.
 *
 * Design rules:
 *  - Keep facts in plain English; PromptRouter locks the final reply to the user's language.
 *  - Strong keywords are whole-word/whole-phrase matches (+3); weak terms are ambiguous (+1).
 *  - Keep website display plan names and internal plan IDs together to avoid mapping mistakes.
 *  - Bump KB_VERSION whenever facts or retrieval behavior changes.
 */

export type KnowledgeEntry = {
  id: string;
  title: string;
  keywords: string[];
  weakKeywords?: string[];
  facts: string[];
};

export const KB_VERSION = "2026-10-11-stealthx-8";

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
  "Stealth-X is a Roblox script platform with public scripts, account dashboard, paid/free licenses, a Lua loader, device/HWID management, and support through Discord tickets or support email.",
] as const;

/** Guardrails shown together with any Stealth-X facts. */
export const KB_RULES = [
  "Use the retrieved Stealth-X facts as the source of truth for plan names, repository-configured prices, quotas, cooldowns, URLs, loader syntax, and documented policies.",
  "These facts were audited from a repository snapshot, not verified live against production. Do not claim to know a live payment/order/license/script/service state unless a trusted live result is present. The checkout UI is the final reference if it differs from this snapshot.",
  "Never invent prices, features, compatibility guarantees, URLs, methods of payment, or policies. Do not describe Alight Motion as a currently supported/purchasable product; active customer-facing source inspected in the audit is Roblox-focused.",
  "For QRIS, explain that activation requires a Discord ticket and manual admin verification. PayPal is processed automatically only after payment is confirmed/captured.",
  "Keep website plan names and their internal IDs distinct: Basic=weekly, Plus=monthly, Pro=lifetime. Do not call the weekly package Pro or the lifetime package Basic.",
  "Reset HWID removes device bindings but does not replace the key. Rotate Key creates a new key and invalidates the old key but preserves the plan, expiry, and device bindings. Never confuse these actions.",
  "Never ask users to send passwords, OTPs, session cookies/tokens, or a full license key in chat. Do not expose admin-only settings, private credentials, or internal secrets.",
  "For personal/live state (payment approval, license validity, remaining quota, current device binding, cooldown readiness, active scripts, executor compatibility, or outages), do not guess. Direct the user to the relevant dashboard, checkout, status page, or official support.",
  "If a policy or answer is not covered by these facts, say that it is not confirmed and direct the user to the official Discord ticket route or support@bytecode.my.id.",
] as const;

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: "urls",
    title: "Official URLs and navigation",
    keywords: [
      "website stealth-x", "stealth-x website", "website link", "website url", "link website",
      "url website", "link dashboard", "dashboard link", "url dashboard", "link login",
      "login link", "link daftar", "link register", "signup link", "link pricing", "pricing link",
      "link docs", "documentation link", "link dokumentasi", "link scripts", "script hub link",
      "link redeem", "link reset hwid", "link status", "status page", "link discord",
      "discord invite", "invite discord", "support email", "loader url", "url loader",
    ],
    weakKeywords: ["website", "web", "url", "link", "tautan", "alamat", "dashboard", "docs", "pricing", "discord", "status"],
    facts: [
      "Main website: https://bytecode.my.id/ .",
      "Pricing section: https://bytecode.my.id/#pricing .",
      "Documentation and quick start: https://bytecode.my.id/docs/ .",
      "Login: https://bytecode.my.id/login/ . Registration: https://bytecode.my.id/login?mode=signup .",
      "Account dashboard: https://bytecode.my.id/dashboard/ .",
      "Checkout entry: https://bytecode.my.id/checkout/?product=roblox&plan=weekly for Basic; replace plan with monthly for Plus or lifetime for Pro. The checkout page is the final place to confirm current price and payment availability.",
      "Redeem: https://bytecode.my.id/redeem/ . Reset HWID: https://bytecode.my.id/reset-hwid/ .",
      "Public Script Hub: https://bytecode.my.id/scripts/ . A script detail uses https://bytecode.my.id/scripts/?id={slug} .",
      "Terms: https://bytecode.my.id/terms/ . Privacy: https://bytecode.my.id/privacy/ . Cookies: https://bytecode.my.id/cookies/ .",
      "Service status page: https://status.stealth-x.workers.dev/ . Use this page for current incidents rather than guessing from source code.",
      "Canonical Discord redirect in repository configuration: https://bytecode.my.id/discord . The repository also contains a conflicting direct invite URL; use the canonical redirect instead of inventing or choosing another invite.",
      "Support email: support@bytecode.my.id . General contact email: contact@bytecode.my.id .",
      "Lua loader: https://api.bytecode.my.id/loader.lua . Always use the API subdomain for the loader, not https://bytecode.my.id/loader.lua .",
      "Public raw-script URL pattern: https://api.bytecode.my.id/raw/scripts/{slug}.lua . A slug must come from the current public script catalog; do not invent one.",
    ],
  },
  {
    id: "pricing",
    title: "Plans, prices, duration, quotas, and devices",
    keywords: [
      "harga paket", "paket harga", "list harga", "price list", "pricing plans", "plan prices",
      "stealth-x price", "stealthx price", "basic plan", "paket basic", "harga basic", "basic berapa",
      "plus plan", "paket plus", "harga plus", "plus berapa", "pro plan", "paket pro", "harga pro",
      "pro lifetime", "stealth pro", "stealth plus", "free plan", "paket free", "harga free",
      "free key", "get free key", "cara dapat free key", "cara mendapatkan key free", "free access",
      "daily execution limit", "weekly execution limit", "batas eksekusi", "limit eksekusi",
      "device slot", "device slots", "slot perangkat", "berapa device", "berapa perangkat",
    ],
    weakKeywords: [
      "harga", "price", "pricing", "cost", "biaya", "tarif", "paket", "plan", "plans",
      "berapa", "how much", "murah", "cheap", "pro", "plus", "basic", "free", "weekly",
      "monthly", "lifetime", "langganan", "durasi", "kuota", "quota", "limit", "slot", "device",
    ],
    facts: [
      "Free: Rp0 / $0; configured as non-expiring; 1 device slot; default quota 10 executions per day and 70 per week; includes selected Roblox scripts and community Discord support. Free quotas are configurable at runtime, so treat these quota values as repository defaults, not guaranteed live values.",
      "Basic (internal plan ID: weekly): Rp15,000 / $1.99; 7 days; 1 device slot; 25 executions per day and 175 per week; supported Roblox scripts and automatic script updates; standard support. Reset HWID and Rotate Key cooldowns are each 7 days.",
      "Plus (internal plan ID: monthly): Rp25,000 / $3.49; 30 days; 3 device slots; 50 executions per day and 350 per week; supported Roblox scripts, automatic updates, private Discord customer lounge, and priority support. Reset HWID and Rotate Key cooldowns are each 5 days.",
      "Pro (internal plan ID: lifetime): Rp80,000 / $6.99; lifetime/permanent access; 5 device slots; 100 executions per day and 700 per week; supported Roblox scripts, automatic updates, exclusive Discord role, and priority one-on-one support. Reset HWID and Rotate Key cooldowns are each 3 days.",
      "The USD and IDR prices above are the values in the audited repository snapshot. If the production checkout displays a different current amount or a method is unavailable, tell the user to follow the live checkout rather than overriding it with a guess.",
      "Free is not described as including all supported Roblox scripts. The paid plans are described as including all supported Roblox scripts.",
      "A device slot is the plan's configured device capacity; it is not the same thing as daily/weekly execution quota.",
    ],
  },
  {
    id: "purchase",
    title: "How to buy, renew, upgrade, and refund policy",
    keywords: [
      "cara beli", "cara membeli", "how to buy", "how do i buy", "where to buy stealth-x",
      "buy a plan", "purchase plan", "beli paket", "beli basic", "beli plus", "beli pro", "buy plus", "buy pro", "buy basic", "checkout", "renew license", "renewal license",
      "perpanjang lisensi", "perpanjang license", "upgrade plan", "upgrade paket", "downgrade plan",
      "refund", "money back", "pengembalian dana", "cancel purchase", "order expired", "pesanan expired",
    ],
    weakKeywords: ["beli", "buy", "purchase", "order", "checkout", "renew", "renewal", "upgrade", "downgrade", "refund", "dana", "cancel", "perpanjang", "paket", "license", "lisensi"],
    facts: [
      "To buy a paid plan: open https://bytecode.my.id/#pricing, choose Basic, Plus, or Pro, sign in or create an account if asked, then complete checkout at https://bytecode.my.id/checkout/ . The checkout URL uses product=roblox and the internal plan ID: weekly for Basic, monthly for Plus, lifetime for Pro.",
      "To create an account, use https://bytecode.my.id/login?mode=signup . Login is at https://bytecode.my.id/login/ .",
      "When purchasing against an existing license, selecting the same plan is a renewal; selecting a higher plan is an upgrade. A lower plan is not supported for the same license; start a new license instead.",
      "After a successful PayPal payment confirmation/capture, the license is processed automatically. QRIS orders require the manual verification flow in a Discord ticket before activation.",
      "The audited checkout defaults a pending order expiry to 30 minutes, but this duration is configurable. Do not promise that an expired order can still be paid; instruct the user to reopen checkout and inspect the current order state.",
      "The repository Terms of Service says completed purchases are final and non-refundable once a digital license has been generated or delivered. Direct a user to the Terms page and official support for a case-specific question; do not promise an exception.",
    ],
  },
  {
    id: "payment",
    title: "Payment methods and payment troubleshooting",
    keywords: [
      "paypal", "qris", "metode pembayaran", "payment method", "payment methods", "cara bayar",
      "cara pembayaran", "how to pay", "bukti transfer", "payment proof", "qris pending", "qris manual",
      "paypal pending", "payment pending", "pembayaran pending", "payment approved", "pembayaran masuk",
    ],
    weakKeywords: ["payment", "pay", "bayar", "pembayaran", "transfer", "tf", "dana", "gopay", "invoice", "transaksi", "checkout", "bukti", "pending"],
    facts: [
      "PayPal: the server creates an order and processes the license automatically after the payment is confirmed/captured. Do not claim an individual payment has succeeded unless a trusted live order result confirms it.",
      "QRIS: select QRIS at checkout, follow the Discord ticket flow, submit payment proof in the ticket, and wait for manual admin verification. After verification, refresh the Dashboard to check the license status.",
      "The audited backend confirms a manual QRIS flow. Some checkout copy mentions local e-wallets, but the inspected backend did not confirm separate e-wallet handlers; do not promise DANA, GoPay, bank transfer, or other local payment methods unless the current checkout explicitly offers them.",
      "QRIS availability can depend on runtime configuration and user region/IP. The repository snapshot cannot confirm whether QRIS or PayPal is enabled for a specific user right now.",
      "For a payment that is pending, missing, or disputed, do not ask for passwords or payment account credentials. Direct the user to their checkout/dashboard and the official Discord ticket or support@bytecode.my.id.",
    ],
  },
  {
    id: "loader",
    title: "Lua loadstring, key format, and loader troubleshooting",
    keywords: [
      "loadstring", "loader.lua", "loader url", "url loader", "script loader", "cara inject stealth",
      "cara pakai key", "cara menggunakan key", "how to use key", "how to get key", "how do i get a key",
      "cara dapat key", "cara mendapatkan key", "ambil key", "get free key", "free key", "how to run loader", "run stealth-x",
      "gagal inject", "loader error", "invalid key", "key invalid", "key error", "error key",
      "key expired", "key kadaluarsa", "key kedaluwarsa", "sk-stx", "sk-cdex", "executor support",
    ],
    weakKeywords: ["loader", "inject", "execute", "executor", "key", "license", "lisensi", "error", "expired", "script", "load", "run"],
    facts: [
      "The documented Roblox Lua loader snippet is:\ngetgenv().Key = \"YOUR_KEY_HERE\"\nloadstring(game:HttpGet(\"https://api.bytecode.my.id/loader.lua\"))()",
      "Free access/key is described as being obtained through the official Discord community flow. Start from https://bytecode.my.id/discord and follow the current official instructions; the audited repository does not establish a permanent channel-specific claim URL. Paid-plan keys are available through the authenticated Dashboard after purchase processing.",
      "Replace YOUR_KEY_HERE with the user's own full, unmodified active license key. The repository's documented key prefixes include sk-stx- and sk-cdex-; do not ask users to paste their full key into the Discord conversation.",
      "Use https://api.bytecode.my.id/loader.lua as the loader URL. The Worker explicitly rejects the website host for this route with a subdomain_required error, so https://bytecode.my.id/loader.lua is not the correct loader endpoint.",
      "A loader key must be valid and active, not expired or revoked, and must satisfy device/HWID binding and execution quota checks. A correct code snippet cannot bypass those server-side checks.",
      "For a missing key, sign in to https://bytecode.my.id/dashboard/ and check Subscription or Key History. If the key cannot be revealed, Rotate Key may issue a replacement and invalidate the old key.",
      "For HWID mismatch, see the Reset HWID entry. For network/service issues, check https://status.stealth-x.workers.dev/ and contact official support if needed.",
      "The audited repository does not contain an authoritative compatibility list for specific executors. Do not guarantee support for a named executor or claim that use is undetectable/risk-free; advise using a compatible environment that supports the required Roblox Lua HTTP and loading functions.",
    ],
  },
  {
    id: "license",
    title: "License key lookup, history, expiry, and errors",
    keywords: [
      "license key", "licence key", "key lisensi", "lisensi key", "key history", "riwayat key",
      "lupa key", "key hilang", "lost key", "forgot key", "my key", "key saya", "key aku",
      "key expired", "license expired", "license revoked", "key bocor", "key leaked", "stolen key",
      "reveal key", "show key", "lihat key", "cek license", "check license",
    ],
    weakKeywords: ["license", "licence", "lisensi", "key", "kunci", "expired", "kadaluarsa", "bocor", "leaked", "stolen", "hilang", "lost", "lupa", "forgot", "subscription", "riwayat"],
    facts: [
      "For a lost or forgotten key, sign in at https://bytecode.my.id/login/, open https://bytecode.my.id/dashboard/, then check Subscription or Key History. Use Reveal Key if the dashboard offers it.",
      "If a stored key cannot be revealed, Rotate Key can issue a new one; the previous key becomes invalid immediately. Save the new key and replace it in the local loader configuration.",
      "Do not ask the user to post a full key in Discord chat. The bot cannot confirm an individual license's validity, expiration, revocation, or remaining quota from static knowledge; ask them to inspect the authenticated Dashboard or contact support.",
      "If a key returns an error, check that the entire key was copied correctly, it is the user's own key, the license is active and not expired/revoked, the loader URL is correct, and the device binding and quota have not been rejected.",
    ],
  },
  {
    id: "hwid",
    title: "Reset HWID and device slots",
    keywords: [
      "hwid", "reset hwid", "hardware id", "reset device", "reset perangkat", "linked device",
      "linked devices", "connected devices", "device limit", "max device", "slot device",
      "slot perangkat", "ganti pc", "pindah hp", "ganti device", "pindah device", "hwid mismatch",
      "device locked", "perangkat terkunci", "reset cooldown", "cooldown hwid",
    ],
    weakKeywords: ["device", "devices", "perangkat", "slot", "lock", "pc", "hp", "reset", "cooldown", "ganti", "pindah"],
    facts: [
      "Reset HWID page: https://bytecode.my.id/reset-hwid/ . Sign in first, select the correct license, inspect its status, and use Reset HWID only when the server reports it is eligible/Ready.",
      "Reset HWID removes the selected license's current device/HWID bindings so a device can bind again. It does not replace or rotate the license key.",
      "Configured reset cooldowns: Basic (weekly) 7 days; Plus (monthly) 5 days; Pro (lifetime) 3 days. The backend clock is authoritative; the website/API's current eligibility and nextResetAt state take precedence.",
      "Free, expired, or revoked licenses are not eligible for the paid-plan Reset HWID flow in the audited backend. A reinstall, changing a device manually, or repeatedly pressing the button does not bypass the server-side cooldown.",
      "The Dashboard's Devices/Connected Devices areas show configured device slots and currently linked devices. Device capacity is determined by plan: Free 1, Basic 1, Plus 3, Pro 5.",
      "If the page shows Cooldown, tell the user to follow the next-available time shown in the Dashboard. Do not claim support can reset it manually unless an official support policy confirms that exception.",
    ],
  },
  {
    id: "rotate-key",
    title: "Rotate Key and leaked keys",
    keywords: [
      "rotate key", "rotate license", "regenerate key", "generate new key", "new license key",
      "key bocor", "key leaked", "key stolen", "key dicuri", "ganti key", "replace key", "old key",
      "key lama", "rotasi key", "key tidak bisa di reveal", "cannot reveal key",
    ],
    weakKeywords: ["rotate", "regenerate", "new", "ganti", "key", "license", "lisensi", "bocor", "leaked", "stolen", "replacement"],
    facts: [
      "Use Rotate Key from the authenticated Dashboard when a license key has leaked/stolen or when the existing key cannot be revealed and a replacement is required.",
      "Rotate Key issues a new license key and immediately invalidates the old key. The user must save/copy the replacement and update the key in the loader configuration.",
      "Configured Rotate Key cooldowns: Basic 7 days; Plus 5 days; Pro 3 days. Key rotation cooldown and Reset HWID cooldown use separate timestamps even though their intervals are the same for each paid plan.",
      "Rotate Key preserves the license's plan, expiration, and device bindings. It does not free device slots or reset HWID. Use Reset HWID when the problem is the device binding, not when the key itself must be replaced.",
      "Never request the user's full existing or replacement key in chat. The bot cannot rotate a user's key by itself; the user must use the authenticated official UI or an authorized backend action.",
    ],
  },
  {
    id: "authentication",
    title: "Login, registration, and password reset",
    keywords: [
      "login", "log in", "sign in", "register", "registration", "create account", "buat akun",
      "daftar akun", "signup", "sign up", "forgot password", "lupa password", "reset password",
      "password reset", "login google", "google login", "github login", "akun github", "akun google",
    ],
    weakKeywords: ["account", "akun", "email", "password", "sandi", "login", "masuk", "daftar", "signup", "oauth"],
    facts: [
      "Login page: https://bytecode.my.id/login/ . Registration form: https://bytecode.my.id/login?mode=signup .",
      "The audited UI supports Google, GitHub, and email/password authentication. Use the original sign-in provider for the account in question.",
      "For password reset, enter the account email in the login identity field and select Forgot password; the configured Firebase flow sends a reset email. Check the email inbox/spam folder.",
      "Accounts authenticated through different providers are not automatically merged just because they use the same email address. If the user chose a different provider and cannot access the account, direct them to support@bytecode.my.id.",
      "Do not request or accept a user's password, one-time password (OTP), session cookie, or login token in chat.",
    ],
  },
  {
    id: "redeem",
    title: "Redeem codes and vouchers",
    keywords: [
      "redeem", "redeem code", "voucher", "tukar kode", "kode promo", "promo code", "kode voucher",
      "kupon", "coupon", "claim code", "klaim kode", "redeem key", "redeem-code", "redeem-key",
    ],
    weakKeywords: ["code", "kode", "klaim", "claim", "promo", "voucher", "kupon"],
    facts: [
      "Redeem page: https://bytecode.my.id/redeem/ . The user must be signed in. The aliases /redeem-code and /redeem-key redirect to the same page.",
      "Enter a code supplied by an authorized administrator or official community event and submit Redeem Code. A successful redemption creates a unique license or extends a matching active license according to the code's plan rules.",
      "The audited implementation allows a voucher/redeem code to be claimed once per account. Weekly/monthly codes can extend an active license of the same plan or create a new license when there is no matching active license. Lifetime codes grant lifetime access only if the account does not already have an active lifetime license.",
      "Redeem activity is logged. Abuse may result in account suspension or an IP ban according to the documented policy. Do not promise a code will work without checking its validity, expiry, and eligibility through the official UI/backend.",
      "After redeeming, open the Dashboard to check the created/updated license and copy the key. Then use the official loader snippet. Do not post the full key in public chat.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard, subscriptions, key history, and cloud scripts",
    keywords: [
      "dashboard", "stealth dashboard", "dashboard stealth", "menu dashboard", "cloud script",
      "cloud storage", "script storage", "session log", "activity log", "purchase history",
      "subscription menu", "plan licenses", "connected devices", "profile settings", "upload script",
      "publish script", "public script", "script hub", "scripts catalog", "script catalog",
    ],
    weakKeywords: ["akun", "account", "subscription", "session", "login", "profil", "profile", "storage", "upload", "publish", "script", "menu"],
    facts: [
      "Dashboard URL: https://bytecode.my.id/dashboard/ . It contains profile/personal information, sign-in and sessions, Subscription and Plan Licenses, purchase history, devices/HWID, Key History, and account activity.",
      "Cloud Script Storage is personal script storage with quota. Public scripts can be managed/published through the script tools when the account and submission meet the UI/backend rules.",
      "Profile UI rules in the audited source: display name can be changed once every 7 days; profile image accepts JPG, PNG, or WebP up to 1 MB.",
      "Do not claim that an account's upload quota, subscription status, current license list, or activity history has a particular value unless a trusted authenticated runtime result provides it.",
    ],
  },
  {
    id: "scripts",
    title: "Public Script Hub and script availability",
    keywords: [
      "script hub", "public scripts", "script catalog", "scripts list", "list script", "daftar script",
      "script tersedia", "available script", "script masih aktif", "script terbaru", "raw script",
      "upload script", "publish script", "script roblox", "place id", "game id script",
    ],
    weakKeywords: ["script", "scripts", "catalog", "list", "game", "roblox", "upload", "publish", "active", "available"],
    facts: [
      "Public Script Hub: https://bytecode.my.id/scripts/ . Public script detail pages use https://bytecode.my.id/scripts/?id={slug} .",
      "The public catalog is dynamic and its current entries, publication state, votes, version, and source permission come from the live API/database. Do not invent script names, availability, compatibility, or version numbers from static knowledge.",
      "A public raw source follows https://api.bytecode.my.id/raw/scripts/{slug}.lua only when a valid current public slug exists. Do not manufacture a slug or imply every catalog entry exposes raw source.",
      "The audited UI supports uploading/publishing a Lua script with a game name and Roblox Place ID when its permissions and backend checks allow it. Some vote and management actions require login.",
      "If asked which scripts are currently available or which version is latest, use live catalog information when available; otherwise direct the user to the Script Hub.",
    ],
  },
  {
    id: "features",
    title: "What Stealth-X is and general features",
    keywords: [
      "apa itu stealth-x", "what is stealth-x", "stealthx itu apa", "stealth-x itu apa",
      "fitur stealth", "stealth features", "kelebihan stealth", "keunggulan stealth-x",
      "what does stealth-x do", "stealth-x features",
    ],
    weakKeywords: ["fitur", "feature", "features", "kelebihan", "keistimewaan", "auto update", "auto-update", "benefit", "benefits", "premium", "platform"],
    facts: [
      "Stealth-X is a Roblox-focused script platform with a Lua loader, free and paid license plans, automatic script updates for paid plans, a public community Script Hub, a dashboard, device/HWID management, and account/license support.",
      "The Dashboard and server enforce license validity, expiration, plan device capacity, HWID/device binding, and execution quota. A plan purchase does not bypass those checks.",
      "The active customer-facing product and checkout implementation audited in the repository is Roblox-focused. Older documentation referring to Alight Motion endpoints was not matched by active worker handlers in the inspected source; do not tell users Alight Motion is currently offered without fresh confirmation.",
    ],
  },
  {
    id: "support",
    title: "Official support and escalation",
    keywords: [
      "buka tiket", "open ticket", "open a ticket", "create ticket", "buat tiket", "customer service",
      "hubungi admin", "contact admin", "contact support", "support email", "discord support",
      "lapor masalah", "report issue", "ticket qris", "qris ticket", "support contact",
    ],
    weakKeywords: ["support", "help", "bantuan", "admin", "tiket", "ticket", "komunitas", "community", "hubungi", "lapor", "report", "cs", "moderator"],
    facts: [
      "Support is handled through the official Discord ticket flow, especially for QRIS manual verification and license/technical problems. Start from https://bytecode.my.id/discord to use the canonical Discord redirect configured by the repository.",
      "Technical support email: support@bytecode.my.id . General contact email: contact@bytecode.my.id .",
      "If an answer is not covered by the verified knowledge, or a user needs a payment/license/account decision, direct them to the official ticket/support flow. Do not claim a ticket has been opened or a payment has been approved unless a system action or trusted live result confirms it.",
    ],
  },
  {
    id: "status",
    title: "Service status and live state",
    keywords: [
      "status service", "service status", "server down", "stealth down", "website down", "loader down",
      "api down", "service outage", "outage", "incident", "maintenance status", "status page",
      "is it down", "down sekarang", "gangguan server", "website error", "loader tidak bisa",
    ],
    weakKeywords: ["status", "server", "down", "gangguan", "error", "maintenance", "api", "website", "loader", "sekarang"],
    facts: [
      "Service status page: https://status.stealth-x.workers.dev/ . Check the live page for current component state and incidents.",
      "Repository source and build output cannot prove whether a service is currently online, degraded, or under maintenance. Do not invent uptime percentages, incident causes, or resolution times.",
      "Individual payment approval, account state, license expiration/revocation, execution quota, current device binding, reset/rotation cooldown, and live script availability require authorized live data. Static KB facts must not be presented as a user's current account state.",
    ],
  },
  {
    id: "policy",
    title: "Terms, privacy, and safe account handling",
    keywords: [
      "terms of service", "tos", "refund policy", "privacy policy", "data privacy", "cookie policy",
      "kebijakan refund", "aturan refund", "aturan penggunaan", "syarat layanan", "privasi", "data akun",
    ],
    weakKeywords: ["terms", "privacy", "refund", "policy", "kebijakan", "aturan", "cookies", "data"],
    facts: [
      "Terms of Service: https://bytecode.my.id/terms/ . Privacy Policy: https://bytecode.my.id/privacy/ . Cookie Policy: https://bytecode.my.id/cookies/ .",
      "The repository Terms of Service says completed purchases are final and non-refundable once the digital license has been generated or delivered. Refer to the published Terms and support for case-specific disputes; do not promise a refund exception.",
      "Never ask for or repeat passwords, OTPs, session cookies/tokens, or full license keys. Do not expose admin-only configuration, private credentials, account records, or internal secrets in customer-facing responses.",
    ],
  },
];

/** Entry used when a message is clearly about Stealth-X but matches no specific topic. */
export const OVERVIEW_ENTRY: KnowledgeEntry =
  KNOWLEDGE_BASE.find((e) => e.id === "features") ?? KNOWLEDGE_BASE[0];

const STRONG_SCORE = 3;
const WEAK_SCORE = 1;
const DEFAULT_MIN_SCORE = 3;
const DIRECT_BRAND_PATTERN = /\b(stealth-?x|hwid|loader|cloud script|redeem|voucher|sk-stx-|sk-cdex-)\b/i;
const PLAN_WORD_PATTERN = /\b(basic|plus|pro|free|weekly|monthly|lifetime)\b/i;
const PLAN_CONTEXT_PATTERN = /\b(harga|price|pricing|cost|biaya|berapa|durasi|duration|beli|buy|purchase|checkout|paket|plan|license|lisensi|slot|quota|kuota|limit|eksekusi|execution|cooldown|reset|upgrade|renew|perpanjang)\b/i;
const PRODUCT_CONTEXT_PATTERN = /\b(website|dashboard|discord|qris|paypal|license|lisensi|script|roblox|checkout|loader|reset|redeem|voucher|hwid|key|kunci|harga|price|beli|buy|support|status)\b/i;

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

/** Ranks entries for a query. A specific term or several generic terms must qualify. */
export function getRelevantKnowledge(
  query: string,
  options: { maxEntries?: number; minScore?: number } = {},
): KnowledgeEntry[] {
  const { maxEntries = 3, minScore = DEFAULT_MIN_SCORE } = options;
  if (!query.trim()) return [];

  const scores = new Map(KNOWLEDGE_BASE.map((entry) => [entry.id, { entry, score: scoreEntry(entry, query) }]));
  const q = query.toLowerCase();
  const boost = (id: string, condition: boolean) => {
    const item = scores.get(id);
    if (item && condition) item.score = Math.max(item.score, STRONG_SCORE);
  };

  // Intent-aware fallback for natural short questions that don't contain our exact phrase variants.
  const asksAboutPlan = PLAN_WORD_PATTERN.test(q) && PLAN_CONTEXT_PATTERN.test(q);
  boost("pricing", asksAboutPlan);
  const buyingIntent = /\b(beli|buy|purchase|order|checkout|renew|renewal|upgrade|downgrade|perpanjang)\b/i.test(q);
  boost("purchase", (asksAboutPlan && buyingIntent) || (DIRECT_BRAND_PATTERN.test(q) && buyingIntent));
  boost("urls", /\b(website|web|websitenya|webnya|situs)\b/i.test(q) && /\b(mana|link|url|alamat|stealth-?x)\b/i.test(q));
  boost("loader", /\b(key|kunci|license|lisensi)\b/i.test(q) && /\b(dapat|mendapatkan|ambil|get|obtain|free|gratis|pakai|gunakan|use|how)\b/i.test(q));
  boost("payment", /\b(qris|paypal|payment|pembayaran|bayar|transfer)\b/i.test(q) && /\b(basic|plus|pro|free|paket|plan|beli|buy|checkout|license|lisensi|order)\b/i.test(q));
  boost("hwid", /\b(reset|cooldown|ganti|pindah)\b/i.test(q) && /\b(hwid|device|perangkat|slot|basic|plus|pro|license|lisensi)\b/i.test(q));

  const hasKeyTerm = /\b(key|kunci|license|lisensi)\b/i.test(q);
  const keyReplacementIntent = hasKeyTerm && /\b(bocor|leaked?|stolen|dicuri|rotate|rotasi|regenerate|replace|ganti|reset|baru|new)\b/i.test(q);
  boost("rotate-key", keyReplacementIntent);
  boost("license", hasKeyTerm && /\b(hilang|lost|lupa|forgot|history|riwayat|expired|kadaluarsa|revoked|invalid|error|cek|check|lihat|show|reveal)\b/i.test(q));
  boost("scripts", /\b(script|scripts|skrip)\b/i.test(q) && /\b(available|tersedia|terbaru|latest|list|daftar|aktif|active|catalog|catalogue|hub|versi|version)\b/i.test(q));
  boost("urls", /\b(link|url|tautan)\b/i.test(q) && PRODUCT_CONTEXT_PATTERN.test(q));

  return [...scores.values()]
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries)
    .map((item) => item.entry);
}


/** True when a query is about Stealth-X directly or strongly implies its plan/product context. */
export function isStealthXQuery(query: string): boolean {
  if (DIRECT_BRAND_PATTERN.test(query)) return true;
  if (getRelevantKnowledge(query, { maxEntries: 1 }).length > 0) return true;
  if (PLAN_WORD_PATTERN.test(query) && PLAN_CONTEXT_PATTERN.test(query)) return true;
  if (/\b(link|url|tautan)\b/i.test(query) && PRODUCT_CONTEXT_PATTERN.test(query)) return true;
  return false;
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

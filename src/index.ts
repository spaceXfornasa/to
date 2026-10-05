import "dotenv/config";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ActivityType,
  type AutocompleteInteraction,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  Options,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { KB_VERSION, MODELS } from "./knowledge";
import { PromptRouter, ATTACHMENT_ONLY_PROMPT, buildSearchFollowUp } from "./router";
import { sanitizeLanguageContamination } from "./language";
import { loadAttachment, type DiscordAttachment } from "./files";
import { convertMarkdownTables, extractCodeFiles, splitDiscordMessage, type CodeFile } from "./text";
import { getObfuscateCommand, handleObfuscation } from "./obfuscator";
import { TavilySearchManager } from "./search";

const DISCORD_USER_AGENT = "StealthAI Discord Bot/1.0";
const AI_GATEWAY_USER_AGENT = "StealthAI AI Gateway Client/1.0";
const MAX_FILE_CHARS = 20000;
const MAX_PERSISTED_MESSAGES_PER_SCOPE = 20;
const STORAGE_SAVE_DELAY_MS = 1500;
const REACTION_READ = "1555619682634039387";
const REACTION_THINKING = "1556145966111793163";
const AI_ALLOWED_ROLE_ID = process.env.DISCORD_ALLOWED_AI_ROLE_ID?.trim() || "1549837787287654411";
const AI_CHANNEL_ID = process.env.DISCORD_AI_CHANNEL_ID?.trim() || "1555277857675022387";
const REACTION_DONE_ID = "1555773804095995964";
const REACTION_DONE_FALLBACK_NAME = "check";
const REACTION_SEARCH_ID = process.env.DISCORD_REACTION_SEARCH_ID?.trim() || "1556145750344204418";
const REACTION_SEARCH_FALLBACK_NAME = "1556145750344204418";
const REACTION_ERROR = "1555770497290080277";

interface ModelBadge {
  emojiId: string;
  fallbackName: string;
  displayName: string;
  label: string;
}

const MODEL_BADGES: Record<string, ModelBadge> = {
  "nemotron": {
    emojiId: "1554112644884209722",
    fallbackName: "nemotron",
    displayName: "Sonnet 4.6",
    label: "**Sonnet 4.6**",
  },
  "gpt-oss": {
    emojiId: "1554112711955185724",
    fallbackName: "openai",
    displayName: "GPT 5.6 Luna",
    label: "**GPT 5.6 Luna**",
  },
  "gemini-2.5-flash": {
    emojiId: "1554112810353688617",
    fallbackName: "gemini",
    displayName: "Gemini 2.5 Flash",
    label: "**Gemini 2.5 Flash**",
  },
  "gemini-2.5-flash-lite": {
    emojiId: "1554112810353688617",
    fallbackName: "gemini",
    displayName: "Gemini 2.5 Flash-Lite",
    label: "**Gemini 2.5 Flash-Lite**",
  },
  "gemini-3.5-flash": {
    emojiId: "1554112810353688617",
    fallbackName: "gemini",
    displayName: "Gemini 3.5 Flash",
    label: "**Gemini 3.5 Flash**",
  },
    "gemma": {
    emojiId: "1554112810353688617",
    fallbackName: "gemma",
    displayName: "Gemini 3.7 Flash",
    label: "**Gemini 3.7 Flash**",
  },
};

const DEFAULT_BADGE: ModelBadge = {
  emojiId: REACTION_DONE_ID,
  fallbackName: REACTION_DONE_FALLBACK_NAME,
  displayName: "Saviera AI",
  label: "___Saviera AI___",
};

const AVAILABLE_MODEL_CHOICES = [
  { name: "Sonnet 4.6", value: "nemotron-3-super" },
  { name: "GPT 5.6 Luna", value: "gpt-oss:120b" },
  { name: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
  { name: "Gemini 2.5 Flash-Lite", value: "gemini-2.5-flash-lite" },
  { name: "Gemini 3.5 Flash", value: "gemini-3.5-flash" },
  { name: "Gemini 3.7 Flash", value: "gemma4:31b" },
] as const;

function resolveModelInput(input: string): string | null {
  const q = input.trim().toLowerCase();
  if (q === "sonnet 4.6" || q === "sonnet 5" || q === "sonnet" || q.includes("sonnet") || q.startsWith("nemotron")) {
    return "nemotron-3-super";
  }
  if (q === "gpt 5.6 luna" || q === "gpt 5.6" || q === "gpt" || q === "luna" || q.startsWith("gpt-oss") || q.startsWith("oss")) {
    return "gpt-oss:120b";
  }
  if (q.includes("flash-lite") || q.includes("flash lite") || q === "gemini-2.5-flash-lite") {
    return "gemini-2.5-flash-lite";
  }
  if (q.includes("3.5") || q === "gemini-3.5-flash") {
    return "gemini-3.5-flash";
  }
  if (q.includes("2.5") || q === "gemini-2.5-flash" || q === "gemini flash") {
    return "gemini-2.5-flash";
  }
  if (q.startsWith("gemma") || q.includes("gemma")) {
    return "gemma4:31b";
  }
  if (q === "gemini" || q.startsWith("gemini")) {
    return "gemini-2.5-flash";
  }
  if (MODELS.includes(q as (typeof MODELS)[number])) {
    return q;
  }
  return null;
}

// Badge is on by default. Set SHOW_MODEL_BADGE=false to hide it.
const SHOW_MODEL_BADGE = process.env.SHOW_MODEL_BADGE?.trim().toLowerCase() !== "false";
const ADMIN_ONLY_MESSAGE = "This command is for admins only.";
const GENERIC_AI_ERROR = "Sorry, the AI request failed. Please try again in a moment.";

/** Error whose message is safe to show to any user. Anything else is logged and replaced by GENERIC_AI_ERROR. */
class UserFacingError extends Error {}

const STORAGE_PATH = resolve(process.env.BOT_STORAGE_PATH || "./storage/state.json");
// Optional extra owner rules. Appended to the built-in persona by the router; it never replaces it.
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT?.trim() || "";

interface PersistedState {
  version: 2;
  settings: Record<string, string>;
  messages: Record<string, Array<{ role: "user" | "assistant"; content: string; createdAt: number }>>;
  dailyUsage: Record<string, number>;
}

type DiscordUser = { id: string; bot?: boolean; username?: string; globalName?: string };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

type OllamaChatResponse = {
  model?: string;
  message?: { role?: string; content?: string };
  error?: string;
  retryAfter?: number;
};

type GatewayStatusResponse = {
  ok: boolean;
  ready?: number;
  total?: number;
  keys?: Array<{
    index: number;
    state: "ready" | "cooldown" | "disabled";
    limitType?: string;
    cooldownUntil?: number;
    lastStatus?: number;
  }>;
  error?: string;
};

type BotConfig = {
  token: string;
  applicationId: string;
  guildId: string;
  adminIds: string[];
  prefix: string;
  defaultModel: string;
  aiGatewayUrl: string;
  aiGatewayToken: string;
  systemPrompt: string;
  defaultDailyLimit: number;
  dailyResetTz: string;
  maxHistoryMessages: number;
  maxHistoryChars: number;
  maxResponseChars: number;
  maxConversationScopes: number;
  maxConcurrentAi: number;
  aiGatewayTimeoutMs: number;
};

function envString(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function parseCsv(value: string): string[] {
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days) return `${unit(days, "day")}${hours ? ` ${unit(hours, "hour")}` : ""}`;
  if (hours) return `${unit(hours, "hour")}${minutes ? ` ${unit(minutes, "minute")}` : ""}`;
  if (minutes) return unit(minutes, "minute");
  return unit(totalSeconds, "second");
}

function currentDateKey(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}


function buildSlashCommands(): (SlashCommandBuilder | SlashCommandOptionsOnlyBuilder)[] {
  return [
    getObfuscateCommand(),
    new SlashCommandBuilder()
      .setName("ask")
      .setDescription("Ask the AI a question")
      .addStringOption((o) => o.setName("prompt").setDescription("Your question or instruction for the AI").setRequired(true).setMaxLength(2000))
      .addAttachmentOption((o) => o.setName("file").setDescription("Image or code/text file (optional)").setRequired(false)),
    new SlashCommandBuilder()
      .setName("chat")
      .setDescription("Chat with the AI using conversation memory")
      .addStringOption((o) => o.setName("message").setDescription("Your message for the AI").setRequired(true).setMaxLength(2000))
      .addAttachmentOption((o) => o.setName("file").setDescription("Image or code/text file (optional)").setRequired(false)),
    new SlashCommandBuilder().setName("hi").setDescription("Check that the bot is responding"),
    new SlashCommandBuilder().setName("help").setDescription("Show available commands"),
    new SlashCommandBuilder().setName("models").setDescription("Admin: list the available AI models").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName("model").setDescription("Admin: show the AI model used by this server").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName("reset").setDescription("Clear your chat memory in this channel"),
    new SlashCommandBuilder().setName("status").setDescription("Admin: show bot status").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
      .setName("ai-model")
      .setDescription("Admin: set the AI model for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addStringOption((o) =>
        o.setName("model")
          .setDescription("AI model to use")
          .setRequired(true)
          .addChoices(...AVAILABLE_MODEL_CHOICES)
      ),
    new SlashCommandBuilder()
      .setName("ai-limit")
      .setDescription("Admin: set the daily AI message limit per user")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addIntegerOption((o) => o.setName("messages").setDescription("AI messages per user per day (1-20)").setRequired(true).setMinValue(1).setMaxValue(20)),
    new SlashCommandBuilder().setName("ai-status").setDescription("Admin: show internal AI bot status").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName("ai-clear-memory").setDescription("Admin: clear all AI chat memory in this server").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
}

class JsonStore {
  private state: PersistedState = {
    version: 2,
    settings: {},
    messages: {},
    dailyUsage: {},
  };
  private saveTimer: NodeJS.Timeout | null = null;
  private savePromise: Promise<void> | null = null;
  private lastDailyCleanupDate = "";

  async load(): Promise<void> {
    try {
      const raw = await readFile(STORAGE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.state = {
        version: 2,
        settings: parsed.settings ?? {},
        messages: parsed.messages ?? {},
        dailyUsage: parsed.dailyUsage ?? {},
      };
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code !== "ENOENT") console.error("Failed to load storage:", error);
      await this.flush();
    }
  }

  getSetting(key: string): string | null {
    return this.state.settings[key] ?? null;
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) delete this.state.settings[key];
    else this.state.settings[key] = value;
    this.scheduleSave();
  }

  getMessages(scope: string, max: number, maxChars: number): ChatMessage[] {
    const rows = (this.state.messages[scope] ?? []).slice(-max);
    const result: ChatMessage[] = [];
    let used = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      const remaining = Math.max(0, maxChars - used);
      if (!remaining) break;
      const content = row.content.slice(0, remaining);
      result.push({ role: row.role, content });
      used += content.length;
    }
    return result.reverse();
  }

  saveConversation(scope: string, userPrompt: string, answer: string): void {
    const rows = this.state.messages[scope] ?? [];
    const now = Date.now();
    rows.push(
      { role: "user", content: userPrompt.slice(0, 6000), createdAt: now },
      { role: "assistant", content: answer.slice(0, 10000), createdAt: now + 1 },
    );
    this.state.messages[scope] = rows.slice(-MAX_PERSISTED_MESSAGES_PER_SCOPE);
    this.scheduleSave();
  }

  getDailyCount(key: string): number {
    return Number(this.state.dailyUsage[key] ?? 0);
  }

  setDailyCount(key: string, count: number): void {
    if (count <= 0) delete this.state.dailyUsage[key];
    else this.state.dailyUsage[key] = count;
    this.scheduleSave();
  }

  deleteConversation(scope: string): void {
    delete this.state.messages[scope];
    delete this.state.settings[`kb:${scope}`];
    this.scheduleSave();
  }

  clearAllConversations(guildId?: string | null): number {
    let cleared = 0;
    const prefix = guildId ? `${guildId}:` : "";
    for (const scope of Object.keys(this.state.messages)) {
      if (!prefix || scope.startsWith(prefix)) {
        delete this.state.messages[scope];
        delete this.state.settings[`kb:${scope}`];
        cleared += 1;
      }
    }
    if (cleared > 0) this.scheduleSave();
    return cleared;
  }

  cleanupDailyUsage(dateKey: string): void {
    if (this.lastDailyCleanupDate === dateKey) return;
    this.lastDailyCleanupDate = dateKey;
    let changed = false;
    for (const key of Object.keys(this.state.dailyUsage)) {
      const idx = key.lastIndexOf(":");
      if (idx >= 0 && key.slice(idx + 1) < dateKey) {
        delete this.state.dailyUsage[key];
        changed = true;
      }
    }
    if (changed) this.scheduleSave();
  }

  trimConversationScopes(maxScopes: number): void {
    const entries = Object.entries(this.state.messages);
    if (entries.length <= maxScopes) return;
    entries.sort((a, b) => {
      const aTime = a[1][a[1].length - 1]?.createdAt ?? 0;
      const bTime = b[1][b[1].length - 1]?.createdAt ?? 0;
      return aTime - bTime;
    });
    const removeCount = entries.length - maxScopes;
    for (let i = 0; i < removeCount; i += 1) {
      const scope = entries[i][0];
      delete this.state.messages[scope];
      delete this.state.settings[`kb:${scope}`];
    }
    this.scheduleSave();
  }

  getStats(): { scopes: number; messages: number; dailyUsageEntries: number; settings: number } {
    let messages = 0;
    for (const rows of Object.values(this.state.messages)) messages += rows.length;
    return {
      scopes: Object.keys(this.state.messages).length,
      messages,
      dailyUsageEntries: Object.keys(this.state.dailyUsage).length,
      settings: Object.keys(this.state.settings).length,
    };
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const write = async () => {
      await mkdir(dirname(STORAGE_PATH), { recursive: true });
      const tempPath = `${STORAGE_PATH}.tmp`;
      await writeFile(tempPath, JSON.stringify(this.state), "utf8");
      await rename(tempPath, STORAGE_PATH);
    };
    this.savePromise = (this.savePromise ?? Promise.resolve()).then(write).catch((error) => {
      console.error("Failed to save storage:", error);
    });
    await this.savePromise;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, STORAGE_SAVE_DELAY_MS);
  }
}

class StealthBot {
  readonly client: Client;
  readonly store = new JsonStore();
  readonly config: BotConfig;
  readonly searchManager: TavilySearchManager;
  private readyAt = 0;
  private stopping = false;
  private activeAiRequests = 0;

  constructor(config: BotConfig) {
    this.config = config;
    this.searchManager = new TavilySearchManager(config.aiGatewayUrl, config.aiGatewayToken);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      // Keep only the caches this bot actually benefits from. This is important
      // on low-memory/free hosts because discord.js otherwise keeps message/member
      // objects around even though we do not need historical message objects.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 25,
        GuildMemberManager: 50,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 300, lifetime: 900 },
      },
      partials: [Partials.Channel],
    });

    this.client.once(Events.ClientReady, (client) => {
      this.readyAt = Date.now();
      this.updatePresence();
      console.log(`Logged in as ${client.user.tag}`);
      console.log(`Gateway: connected | Guilds: ${client.guilds.cache.size}`);
      void this.registerSlashCommands();
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.handleMessage(message).catch((error) => {
        console.error("Message handler failed:", error);
      });
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isAutocomplete()) {
        void this.handleAutocomplete(interaction).catch(() => {});
        return;
      }
      if (!interaction.isChatInputCommand()) return;
      void this.handleSlashCommand(interaction).catch((error) => {
        console.error("Slash handler failed:", error);
        void this.replySlashError(interaction, "Internal error. Please try again in a moment.");
      });
    });

    this.client.on(Events.Error, (error) => console.error("Discord client error:", error));
    this.client.on(Events.Warn, (info) => console.warn("Discord warning:", info));
  }

  async start(): Promise<void> {
    await this.store.load();
    this.installShutdownHandlers();
    await this.client.login(this.config.token);
  }

  private installShutdownHandlers(): void {
    const stop = async (signal: string) => {
      if (this.stopping) return;
      this.stopping = true;
      console.log(`Received ${signal}; shutting down gracefully...`);
      await this.store.flush();
      await this.client.destroy();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop("SIGINT"));
    process.once("SIGTERM", () => void stop("SIGTERM"));
  }

  private updatePresence(modelId?: string): void {
    if (!this.client.user) return;
    const effectiveModel = modelId || this.getModelForGuild(this.config.guildId);
    const badge = this.getModelBadge(effectiveModel);
    const modelName = badge.displayName;
    const baseStatus = envString("BOT_STATUS", "Use prefix ! to chat with me");

    let statusText: string;
    if (baseStatus.includes("{model}")) {
      statusText = baseStatus.replace("{model}", modelName);
    } else if (baseStatus.startsWith(modelName)) {
      statusText = baseStatus;
    } else if (baseStatus) {
      statusText = `${modelName}, ${baseStatus}`;
    } else {
      statusText = modelName;
    }

    this.client.user.setPresence({
      activities: [{ name: "custom", type: ActivityType.Custom, state: statusText }],
      status: "online",
    });
    console.log(`Presence: ${statusText}`);
  }

  /** Model names are only suggested to admins; everyone else gets an empty list. */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const allowed = interaction.commandName === "ai-model" && this.isAdmin(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.respond([]);
      return;
    }
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = AVAILABLE_MODEL_CHOICES.filter((c) => c.name.toLowerCase().includes(typed) || c.value.toLowerCase().includes(typed)).slice(0, 25);
    await interaction.respond(choices.map((c) => ({ name: c.name, value: c.value })));
  }

  private async registerSlashCommands(): Promise<void> {
    if (!this.config.applicationId || !this.config.guildId) {
      console.warn("DISCORD_APPLICATION_ID or DISCORD_GUILD_ID is missing; slash commands were not registered.");
      return;
    }

    try {
      const rest = new REST({ version: "10" }).setToken(this.config.token);
      await rest.put(
        Routes.applicationGuildCommands(this.config.applicationId, this.config.guildId),
        { body: buildSlashCommands().map((command) => command.toJSON()) },
      );
      console.log(`Registered ${buildSlashCommands().length} slash commands for guild ${this.config.guildId}.`);
    } catch (error) {
      console.error("Slash command registration failed:", error);
    }
  }

  private isConfiguredGuild(guildId: string | null | undefined): boolean {
    return Boolean(guildId && guildId === this.config.guildId);
  }

  private isAdmin(userId: string, guildId?: string | null): boolean {
    if (!guildId || !this.isConfiguredGuild(guildId)) return false;
    return this.config.adminIds.includes(userId);
  }

  private getConversationScope(guildId: string | null | undefined, channelId: string, userId: string): string {
    if (guildId) return `guild:${guildId}:channel:${channelId}:user:${userId}`;
    return `dm:${userId}`;
  }

  private getGuildSetting(guildId: string | undefined | null, key: string): string | null {
    return guildId ? this.store.getSetting(`guild:${guildId}:${key}`) : null;
  }

  private setGuildSetting(guildId: string | undefined | null, key: string, value: string): void {
    if (!guildId) return;
    this.store.setSetting(`guild:${guildId}:${key}`, value);
  }

  private getModelForGuild(guildId?: string | null): string {
    const configured = this.getGuildSetting(guildId, "model");
    if (configured && MODELS.includes(configured as (typeof MODELS)[number])) return configured;
    return MODELS.includes(this.config.defaultModel as (typeof MODELS)[number]) ? this.config.defaultModel : MODELS[0];
  }

  private getDailyLimitForGuild(guildId?: string | null): number {
    return clampInt(this.getGuildSetting(guildId, "daily_limit") ?? undefined, this.config.defaultDailyLimit, 1, 20);
  }

  private consumeDailyQuota(userId: string, guildId: string | null | undefined): { allowed: boolean; used: number; limit: number } {
    const limit = this.getDailyLimitForGuild(guildId);
    const dateKey = currentDateKey(this.config.dailyResetTz);
    const scope = guildId || "dm";
    const key = `${scope}:${userId}:${dateKey}`;
    const usedBefore = this.store.getDailyCount(key);
    if (usedBefore >= limit) {
      this.store.cleanupDailyUsage(dateKey);
      return { allowed: false, used: usedBefore, limit };
    }
    const used = usedBefore + 1;
    this.store.setDailyCount(key, used);
    this.store.cleanupDailyUsage(dateKey);
    return { allowed: true, used, limit };
  }

  private refundDailyQuota(userId: string, guildId: string | null | undefined): void {
    const dateKey = currentDateKey(this.config.dailyResetTz);
    const scope = guildId || "dm";
    const key = `${scope}:${userId}:${dateKey}`;
    this.store.setDailyCount(key, Math.max(0, this.store.getDailyCount(key) - 1));
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!this.isConfiguredGuild(message.guildId)) return;

    const botId = this.client.user?.id;
    if (!botId) return;

    const mentionPrefix = new RegExp(`<@!?${botId}>`, "g");
    const mentioned = message.mentions.users.has(botId);
    const content = message.content.trim();

    let prompt = "";
    let source: "mention" | "prefix" | "channel" = "mention";

    if (mentioned) {
      prompt = content.replace(mentionPrefix, "").trim();
      source = "mention";
    } else if (content.startsWith(this.config.prefix)) {
      prompt = content.slice(this.config.prefix.length).trim();
      source = "prefix";
    } else if (message.channelId === AI_CHANNEL_ID) {
      // Dedicated Saviera channel: every normal message is an AI prompt.
      prompt = content;
      source = "channel";
    } else {
      return;
    }

    if (!prompt) {
      if (message.attachments.size > 0) {
        prompt = ATTACHMENT_ONLY_PROMPT;
      } else {
        await message.reply({
          content: `Call me with \`@bot question\` or \`${this.config.prefix}question\`. Type \`${this.config.prefix}help\` for commands.`,
          allowedMentions: { repliedUser: false, parse: [] },
        });
        return;
      }
    }

    const firstWord = prompt.split(/\s+/)[0]?.toLowerCase() ?? "";
    const rest = prompt.slice(firstWord.length).trim();
    if (source === "prefix" && await this.tryTextCommand(message, firstWord, rest)) return;
    if (source === "mention" && firstWord === "help" && !rest) {
      await this.sendTextHelp(message);
      return;
    }

    if (!this.canUseAiRole(message.member)) {
      await this.denyAiRole(message);
      return;
    }

    await this.runMessageChat(message, prompt);
  }

  private async tryTextCommand(message: Message, command: string, args: string): Promise<boolean> {
    const utilityCommands = new Set(["hi", "help", "models", "model", "reset", "status", "ai-model", "ai-limit", "ai-status", "ask", "chat"]);
    if (!utilityCommands.has(command)) return false;

    if (command === "hi") {
      if (args) {
        if (!this.canUseAiRole(message.member)) {
          await this.denyAiRole(message);
          return true;
        }
        await this.runMessageChat(message, args);
        return true;
      }
      await message.reply({ content: `Hi ${message.author.globalName ?? message.author.username}.`, allowedMentions: { repliedUser: false, parse: [] } });
      return true;
    }
    if (command === "help") {
      await this.sendTextHelp(message);
      return true;
    }
    if (command === "models") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: ADMIN_ONLY_MESSAGE, allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      const lines = await Promise.all(
        AVAILABLE_MODEL_CHOICES.map(async (c) => {
          const badge = this.getModelBadge(c.value);
          const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
          return `• ${emoji} **${c.name}**`;
        })
      );
      await this.replyPrivately(message, `Available models:\n${lines.join("\n")}`);
      return true;
    }
    if (command === "model") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: ADMIN_ONLY_MESSAGE, allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      const raw = this.getModelForGuild(message.guildId);
      const badge = this.getModelBadge(raw);
      const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
      await this.replyPrivately(message, `Current server model: ${emoji} **${badge.displayName}**`);
      return true;
    }
    if (command === "reset") {
      const scope = this.getConversationScope(message.guildId, message.channelId, message.author.id);
      this.store.deleteConversation(scope);
      await message.reply({ content: "Your chat memory in this channel has been cleared.", allowedMentions: { repliedUser: false, parse: [] } });
      return true;
    }
    if (command === "status") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: ADMIN_ONLY_MESSAGE, allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      await this.replyPrivately(message, await this.statusText(message.guildId));
      return true;
    }
    if (command === "ai-model") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: "You are not authorized to manage this bot.", allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      const resolved = resolveModelInput(args);
      if (!resolved) {
        const availableList = AVAILABLE_MODEL_CHOICES.map((c) => `• **${c.name}**`).join("\n");
        await this.replyPrivately(message, `Invalid model. Use one of:\n${availableList}`);
        return true;
      }
      this.setGuildSetting(message.guildId, "model", resolved);
      this.updatePresence(resolved);
      const badge = this.getModelBadge(resolved);
      const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
      console.log(`Model changed | guild=${message.guildId} | model=${resolved}`);
      await this.replyPrivately(message, `Server model changed to ${emoji} **${badge.displayName}**.`);
      return true;
    }
    if (command === "ai-limit") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: "You are not authorized to manage this bot.", allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      const limit = Number.parseInt(args, 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        await message.reply({ content: "The limit must be between 1 and 20 messages per user per day.", allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      this.setGuildSetting(message.guildId, "daily_limit", String(limit));
      await message.reply({ content: `AI limit is now **${limit} messages/user/day**.`, allowedMentions: { repliedUser: false, parse: [] } });
      return true;
    }
    if (command === "ai-status") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: "You are not authorized to view internal status.", allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      await this.replyPrivately(message, await this.statusText(message.guildId));
      return true;
    }
    if (command === "ai-clear-memory" || command === "ai-reset-all") {
      if (!this.isAdmin(message.author.id, message.guildId)) {
        await message.reply({ content: "You are not authorized to manage this bot.", allowedMentions: { repliedUser: false, parse: [] } });
        return true;
      }
      const count = this.store.clearAllConversations(message.guildId);
      await message.reply({ content: `All AI chat memory in this server has been cleared (${count} scopes/sessions removed).`, allowedMentions: { repliedUser: false, parse: [] } });
      return true;
    }
    if (command === "ask" || command === "chat") {
      if (!this.canUseAiRole(message.member)) {
        await this.denyAiRole(message);
        return true;
      }
      await this.runMessageChat(message, args);
      return true;
    }
    return false;
  }

  private async sendTextHelp(message: Message): Promise<void> {
    const admin = this.isAdmin(message.author.id, message.guildId);
    const p = this.config.prefix;
    const lines = [
      "**StealthAI**",
      "",
      "Chat:",
      `• <@${this.client.user?.id ?? "bot"}> question`,
      `• \`${p}question\``,
      `• \`${p}ask question\``,
      `• \`${p}chat question\` — chat with memory`,
      "",
      "Commands:",
      `• \`${p}hi\``,
      `• \`${p}reset\``,
      "Slash: `/ask`, `/chat`, `/obf`, `/help`",
    ];
    if (admin) {
      lines.push(
        "",
        `Admin: \`${p}models\`, \`${p}model\`, \`${p}status\`, \`${p}ai-model <model>\`, \`${p}ai-limit <1-20>\`, \`${p}ai-clear-memory\`, \`${p}ai-status\``,
        "Admin replies that contain model details are sent to your DMs.",
      );
    }
    await message.reply({ content: lines.join("\n"), allowedMentions: { repliedUser: false, parse: [] } });
  }

  /** Sends sensitive output (model names, internal status) to the admin's DMs, never to the public channel. */
  private async replyPrivately(message: Message, content: string): Promise<void> {
    let delivered = false;
    try {
      await message.author.send({ content, allowedMentions: { parse: [] } });
      delivered = true;
    } catch {}
    const notice = delivered
      ? "Sent to your DMs."
      : "I couldn't DM you. Enable DMs from this server, or use the slash command (its reply is only visible to you).";
    await message.reply({ content: notice, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
  }

  private canUseAiRole(member: Message["member"] | ChatInputCommandInteraction["member"]): boolean {
    if (!member) return false;

    const roles = member.roles;
    if (Array.isArray(roles)) {
      return roles.includes(AI_ALLOWED_ROLE_ID);
    }

    return roles.cache.has(AI_ALLOWED_ROLE_ID);
  }

  private async denyAiRole(message: Message): Promise<void>;
  private async denyAiRole(interaction: ChatInputCommandInteraction): Promise<void>;
  private async denyAiRole(target: Message | ChatInputCommandInteraction): Promise<void> {
    const content = "Sorry, you don't have the role required to chat with Saviera yet.";
    if ("deferred" in target) {
      await target.reply({ content, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {});
    } else {
      await target.reply({ content, allowedMentions: { repliedUser: true } }).catch(() => {});
    }
  }

  private async runMessageChat(message: Message, prompt: string): Promise<void> {
    if (!prompt) {
      await message.reply({ content: `Empty message. Use \`${this.config.prefix}question\` or mention the bot.`, allowedMentions: { repliedUser: true } });
      return;
    }

    let reactedRead = false;
    let reactedThinking = false;
    try {
      await message.react(REACTION_READ);
      reactedRead = true;
    } catch {}

    let fileBlock = "";
    let memoryPrompt = prompt;
    const images: string[] = [];

    if (message.attachments.size > 0) {
      try {
        for (const attachment of message.attachments.values()) {
          const file = await loadAttachment({
            id: attachment.id,
            filename: attachment.name,
            url: attachment.url,
            size: attachment.size,
            content_type: attachment.contentType ?? undefined,
          }, MAX_FILE_CHARS);

          if (file.kind === "image") {
            images.push(file.base64);
            memoryPrompt = `${memoryPrompt}\n[Attached image: ${file.name}]`;
          } else {
            fileBlock +=
              (fileBlock ? "\n\n" : "") +
              `<file name="${file.name}" type="${file.ext}">\n${file.text}\n</file>` +
              (file.truncated ? `\n(Note: file truncated to the first ${MAX_FILE_CHARS} characters.)` : "");
            memoryPrompt = `${memoryPrompt}\n[Attached file: ${file.name}]`;
          }
        }
      } catch (error) {
        await this.safeRemoveReaction(message, REACTION_READ);
        await message.reply({ content: error instanceof Error ? error.message : String(error), allowedMentions: { repliedUser: false, parse: [] } });
        return;
      }
    }

    if (reactedRead) {
      // Add the next state first, then remove the previous one. This avoids
      // a visible empty gap between reaction states.
      reactedThinking = await this.transitionReaction(message, REACTION_READ, REACTION_THINKING);
    }

    const user: DiscordUser = {
      id: message.author.id,
      bot: message.author.bot,
      username: message.author.username,
      globalName: message.author.globalName ?? undefined,
    };

    let quotaConsumed = false;
    let quotaDenied = false;
    const isAdminUser = this.isAdmin(user.id, message.guildId);
    if (!isAdminUser) {
      const quota = this.consumeDailyQuota(user.id, message.guildId);
      if (!quota.allowed) {
        quotaDenied = true;
        if (reactedThinking) {
          await this.safeRemoveReaction(message, REACTION_THINKING);
          reactedThinking = false;
        }
        await message.reply({
          content: `Daily limit reached: ${quota.limit} AI messages/day.\nTry again after the daily reset (${this.config.dailyResetTz}).`,
          allowedMentions: { repliedUser: true },
        });
        return;
      }
      quotaConsumed = true;
    }

    const scope = this.getConversationScope(message.guildId, message.channelId, user.id);
    let reactedSearching = false;
    let answeredSuccessfully = false;
    try {
      const onSearchStart = async () => {
        if (!reactedSearching) {
          reactedSearching = true;
          await this.safeAddCustomReaction(message, REACTION_SEARCH_ID, REACTION_SEARCH_FALLBACK_NAME);
        }
      };

      const result = await this.askOllama(
        scope,
        prompt,
        message.guildId,
        fileBlock,
        memoryPrompt,
        onSearchStart,
        images.length > 0 ? images : undefined,
      );
      await this.sendMessageAnswer(message, result.answer, result.model);
      answeredSuccessfully = true;
    } catch (error) {
      if (quotaConsumed) this.refundDailyQuota(user.id, message.guildId);
      console.error("AI request failed:", error);
      await message.reply({ content: this.publicErrorText(error), allowedMentions: { repliedUser: true } });
    } finally {
      if (quotaDenied) {
        // Daily limit reached cleanly; no error reaction left on message.
      } else if (answeredSuccessfully) {
        const cleanup: Promise<unknown>[] = [
          this.safeAddCustomReaction(message, REACTION_DONE_ID, REACTION_DONE_FALLBACK_NAME),
        ];
        if (reactedSearching) cleanup.push(this.safeRemoveReaction(message, REACTION_SEARCH_ID));
        if (reactedThinking) cleanup.push(this.safeRemoveReaction(message, REACTION_THINKING));
        await Promise.allSettled(cleanup);
      } else {
        const cleanup: Promise<unknown>[] = [
          this.safeAddReaction(message, REACTION_ERROR),
        ];
        if (reactedSearching) cleanup.push(this.safeRemoveReaction(message, REACTION_SEARCH_ID));
        if (reactedThinking) cleanup.push(this.safeRemoveReaction(message, REACTION_THINKING));
        await Promise.allSettled(cleanup);
      }
    }
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!this.isConfiguredGuild(guildId)) {
      await this.replySlashError(interaction, "This command is only available in the configured server.");
      return;
    }

    const command = interaction.commandName;
    if (command === "obf") {
      await handleObfuscation(this.client, interaction);
      return;
    }
    const user = interaction.user;

    if (command === "hi") {
      await interaction.reply({ content: `Hi ${user.globalName ?? user.username}.`, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "help") {
      const admin = this.isAdmin(user.id, guildId);
      // Admin help lists admin commands, so it is only shown privately.
      await interaction.reply({ content: this.helpText(admin), ephemeral: admin, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "models") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: ADMIN_ONLY_MESSAGE, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      const lines = await Promise.all(
        AVAILABLE_MODEL_CHOICES.map(async (c) => {
          const badge = this.getModelBadge(c.value);
          const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
          return `• ${emoji} **${c.name}**`;
        })
      );
      await interaction.reply({ content: `Available models:\n${lines.join("\n")}`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "model") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: ADMIN_ONLY_MESSAGE, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      const raw = this.getModelForGuild(guildId);
      const badge = this.getModelBadge(raw);
      const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
      await interaction.reply({ content: `Current server model: ${emoji} **${badge.displayName}**`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "reset") {
      const scope = this.getConversationScope(guildId, interaction.channelId ?? "", user.id);
      this.store.deleteConversation(scope);
      await interaction.reply({ content: "Your chat memory in this channel has been cleared.", ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "status") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: ADMIN_ONLY_MESSAGE, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      await interaction.reply({ content: await this.statusText(guildId), ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "ai-model") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: "You are not authorized to manage this bot.", ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      const rawInput = interaction.options.getString("model", true).trim();
      const resolved = resolveModelInput(rawInput);
      if (!resolved) {
        const availableList = AVAILABLE_MODEL_CHOICES.map((c) => c.name).join(", ");
        await interaction.reply({ content: `Invalid model. Pick one from the suggestions (${availableList}).`, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      this.setGuildSetting(guildId, "model", resolved);
      this.updatePresence(resolved);
      const badge = this.getModelBadge(resolved);
      const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
      console.log(`Model changed | guild=${guildId} | model=${resolved}`);
      await interaction.reply({ content: `Server model changed to ${emoji} **${badge.displayName}**.`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "ai-limit") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: "You are not authorized to manage this bot.", ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      const limit = interaction.options.getInteger("messages", true);
      this.setGuildSetting(guildId, "daily_limit", String(limit));
      await interaction.reply({ content: `AI limit is now **${limit} messages/user/day**.`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "ai-status") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: "You are not authorized to view internal status.", ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      await interaction.reply({ content: await this.statusText(guildId), ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    if (command === "ai-clear-memory") {
      if (!this.isAdmin(user.id, guildId)) {
        await interaction.reply({ content: "You are not authorized to manage this bot.", ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      const count = this.store.clearAllConversations(guildId);
      await interaction.reply({
        content: `All AI chat memory in this server has been cleared (${count} scopes/sessions removed).`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (command === "ask" || command === "chat") {
      const prompt = interaction.options.getString(command === "ask" ? "prompt" : "message", true).trim();
      const attachment = interaction.options.getAttachment("file");
      if (!this.canUseAiRole(interaction.member)) {
        await this.denyAiRole(interaction);
        return;
      }

      await this.runSlashChat(interaction, prompt, attachment ? {
        id: attachment.id,
        filename: attachment.name,
        url: attachment.url,
        size: attachment.size,
        content_type: attachment.contentType ?? undefined,
      } : undefined);
      return;
    }

    await this.replySlashError(interaction, `Unknown command \`/${command}\`.`);
  }

  private async runSlashChat(interaction: ChatInputCommandInteraction, prompt: string, attachment?: DiscordAttachment): Promise<void> {
    await interaction.deferReply();
    const reply = await interaction.fetchReply();
    let reacted = false;
    try {
      await reply.react(REACTION_READ);
      reacted = true;
    } catch {}
    if (reacted) {
      reacted = await this.transitionReaction(reply, REACTION_READ, REACTION_THINKING);
    }

    let fileBlock = "";
    let memoryPrompt = prompt;
    let images: string[] | undefined;
    if (attachment) {
      try {
        const file = await loadAttachment(attachment, MAX_FILE_CHARS);
        if (file.kind === "image") {
          images = [file.base64];
          memoryPrompt = `${prompt}\n[Attached image: ${file.name}]`;
        } else {
          fileBlock =
            `<file name="${file.name}" type="${file.ext}">\n${file.text}\n</file>` +
            (file.truncated ? `\n(Note: file truncated to the first ${MAX_FILE_CHARS} characters.)` : "");
          memoryPrompt = `${prompt}\n[Attached file: ${file.name}]`;
        }
      } catch (error) {
        await interaction.editReply(error instanceof Error ? error.message : String(error));
        return;
      }
    }

    let quotaConsumed = false;
    const isAdminUser = this.isAdmin(interaction.user.id, interaction.guildId);
    if (!isAdminUser) {
      const quota = this.consumeDailyQuota(interaction.user.id, interaction.guildId);
      if (!quota.allowed) {
        await interaction.editReply(`Daily limit reached: ${quota.limit} AI messages/day.\nTry again after the daily reset (${this.config.dailyResetTz}).`);
        return;
      }
      quotaConsumed = true;
    }

    const channelId = interaction.channelId ?? "";
    const scope = this.getConversationScope(interaction.guildId, channelId, interaction.user.id);
    let reactedSearching = false;
    let answeredSuccessfully = false;
    try {
      const onSearchStart = async () => {
        if (!reactedSearching) {
          reactedSearching = true;
          await this.safeAddCustomReaction(reply, REACTION_SEARCH_ID, REACTION_SEARCH_FALLBACK_NAME);
        }
      };

      const result = await this.askOllama(scope, prompt, interaction.guildId, fileBlock, memoryPrompt, onSearchStart, images);
      const withoutTables = convertMarkdownTables(result.answer);
      const { text, files } = extractCodeFiles(withoutTables);
      await this.editAndSendSlashAnswer(interaction, text, files, result.model);
      answeredSuccessfully = true;
    } catch (error) {
      if (quotaConsumed) this.refundDailyQuota(interaction.user.id, interaction.guildId);
      console.error("AI request failed:", error);
      await interaction.editReply(this.publicErrorText(error));
    } finally {
      if (answeredSuccessfully) {
        const cleanup: Promise<unknown>[] = [
          this.safeAddCustomReaction(reply, REACTION_DONE_ID, REACTION_DONE_FALLBACK_NAME),
        ];
        if (reactedSearching) cleanup.push(this.safeRemoveReaction(reply, REACTION_SEARCH_ID));
        if (reacted) cleanup.push(this.safeRemoveReaction(reply, REACTION_THINKING));
        await Promise.allSettled(cleanup);
      } else {
        const cleanup: Promise<unknown>[] = [
          this.safeAddReaction(reply, REACTION_ERROR),
        ];
        if (reactedSearching) cleanup.push(this.safeRemoveReaction(reply, REACTION_SEARCH_ID));
        if (reacted) cleanup.push(this.safeRemoveReaction(reply, REACTION_THINKING));
        await Promise.allSettled(cleanup);
      }
    }
  }

  private publicErrorText(error: unknown): string {
    return error instanceof UserFacingError ? error.message : GENERIC_AI_ERROR;
  }

  private async editAndSendSlashAnswer(interaction: ChatInputCommandInteraction, text: string, files: CodeFile[], model: string): Promise<void> {
    const sanitized = text;
    const footer = await this.buildAiFooter(model);
    const footerBudget = Math.max(100, this.config.maxResponseChars - footer.length - 2);
    const chunks = splitDiscordMessage(sanitized, footerBudget);
    const isSingle = chunks.length === 1;
    const firstFiles = isSingle ? files : [];
    const firstContent = isSingle ? `${chunks[0]}${footer}` : chunks[0];
    await interaction.editReply({ content: firstContent, files: firstFiles.map((file) => this.toAttachment(file)) });
    for (let i = 1; i < chunks.length; i += 1) {
      const isLast = i === chunks.length - 1;
      const attach = isLast ? files : [];
      const content = isLast ? `${chunks[i]}${footer}` : chunks[i];
      await interaction.followUp({ content, files: attach.map((file) => this.toAttachment(file)), allowedMentions: { parse: [] } });
    }
  }

  private async resolveCustomEmojiTag(emojiId: string, fallbackName: string): Promise<string> {
    try {
      const emoji = this.client.emojis.cache.get(emojiId) ??
        await this.client.guilds.cache.get(this.config.guildId)?.emojis.fetch(emojiId).catch(() => null);
      if (emoji) return emoji.toString();
    } catch (error) {
      console.warn(`Could not resolve custom emoji ${emojiId}:`, error instanceof Error ? error.message : String(error));
    }
    return `<:${fallbackName}:${emojiId}>`;
  }

  private async safeAddCustomReaction(message: Message, emojiId: string, fallbackName: string): Promise<boolean> {
    try {
      const existing = message.reactions.cache.find((reaction) => reaction.emoji.id === emojiId && reaction.me);
      if (existing) return true;
      const emoji = this.client.emojis.cache.get(emojiId) ??
        await message.guild?.emojis.fetch(emojiId).catch(() => null);
      if (emoji) {
        await message.react(emoji.toString());
        return true;
      }
      await message.react(`<:${fallbackName}:${emojiId}>`);
      return true;
    } catch (error) {
      console.warn(`Could not add custom reaction ${emojiId}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private getModelBadge(model: string): ModelBadge {
    const key = model.toLowerCase();
    if (key.includes("flash-lite") || key === "gemini-2.5-flash-lite") return MODEL_BADGES["gemini-2.5-flash-lite"];
    if (key.includes("3.5-flash") || key.includes("3.5") || key === "gemini-3.5-flash") return MODEL_BADGES["gemini-3.5-flash"];
    if (key.includes("2.5-flash") || key.includes("2.5") || key === "gemini-2.5-flash" || key.startsWith("gemini")) return MODEL_BADGES["gemini-2.5-flash"];
    if (key.startsWith("gemma")) return MODEL_BADGES.gemma;
    if (key.startsWith("nemotron")) return MODEL_BADGES.nemotron;
    if (key.startsWith("gpt-oss") || key.startsWith("oss")) return MODEL_BADGES["gpt-oss"];
    return DEFAULT_BADGE;
  }

  private async buildAiFooter(model: string): Promise<string> {
    if (!SHOW_MODEL_BADGE) return "";
    const badge = this.getModelBadge(model);
    const emoji = await this.resolveCustomEmojiTag(badge.emojiId, badge.fallbackName);
    return `\n\n${emoji} ${badge.label}`;
  }

  private async sendMessageAnswer(message: Message, answer: string, model: string): Promise<void> {
    const sanitized = answer;
    const withoutTables = convertMarkdownTables(sanitized);
    const { text, files } = extractCodeFiles(withoutTables);
    const footer = await this.buildAiFooter(model);
    const footerBudget = Math.max(100, this.config.maxResponseChars - footer.length - 2);
    const chunks = splitDiscordMessage(text, footerBudget);

    for (let i = 0; i < chunks.length; i += 1) {
      const isLast = i === chunks.length - 1;
      const attach = isLast ? files : [];
      // Only attach footer to the very last chunk
      const content = isLast ? `${chunks[i]}${footer}` : chunks[i];

      if (i === 0) {
        await message.reply({
          content,
          files: attach.map((file) => this.toAttachment(file)),
          allowedMentions: { repliedUser: true },
        });
      } else {
        // Continuation chunks: send as clean follow-up without re-quoting the user message
        if ("send" in message.channel && typeof message.channel.send === "function") {
          await message.channel.send({
            content,
            files: attach.map((file) => this.toAttachment(file)),
            allowedMentions: { parse: [] },
          });
        } else {
          await message.reply({
            content,
            files: attach.map((file) => this.toAttachment(file)),
            allowedMentions: { repliedUser: false, parse: [] },
          });
        }
      }
    }
  }

  private toAttachment(file: CodeFile): AttachmentBuilder {
    return new AttachmentBuilder(Buffer.from(file.content, "utf8"), { name: file.name });
  }

  private async transitionReaction(message: Message, fromEmoji: string, toEmoji: string): Promise<boolean> {
    try {
      await message.react(toEmoji);
    } catch {
      return false;
    }

    await this.safeRemoveReaction(message, fromEmoji);
    return true;
  }

  private async transitionToCustomReaction(message: Message, fromEmoji: string, emojiId: string, fallbackName: string): Promise<void> {
    const added = await this.safeAddCustomReaction(message, emojiId, fallbackName);
    if (added) await this.safeRemoveReaction(message, fromEmoji);
  }

  private async safeRemoveReaction(message: Message, emojiOrId: string): Promise<void> {
    const botUser = this.client.user;
    if (!botUser || !emojiOrId) return;
    try {
      const reaction =
        message.reactions.resolve(emojiOrId) ??
        message.reactions.cache.find(
          (r) => r.emoji.id === emojiOrId || r.emoji.name === emojiOrId || r.emoji.toString() === emojiOrId
        );
      await reaction?.users.remove(botUser.id);
    } catch {}
  }

  private async safeAddReaction(message: Message, emoji: string): Promise<void> {
    try {
      const existing = message.reactions.resolve(emoji);
      if (existing?.me) return;
      await message.react(emoji);
    } catch {}
  }

  private async askOllama(
    scope: string,
    userPrompt: string,
    guildId?: string | null,
    fileBlock = "",
    memoryPrompt = userPrompt,
    onSearchStart?: () => Promise<void> | void,
    images?: string[],
  ): Promise<{ answer: string; model: string }> {
    if (this.activeAiRequests >= this.config.maxConcurrentAi) {
      throw new UserFacingError("The AI is busy right now. Please try again in a moment.");
    }
    this.activeAiRequests += 1;
    try {
      return await this.askOllamaInternal(scope, userPrompt, guildId, fileBlock, memoryPrompt, onSearchStart, images);
    } finally {
      this.activeAiRequests = Math.max(0, this.activeAiRequests - 1);
    }
  }

  private async askOllamaInternal(
    scope: string,
    userPrompt: string,
    guildId?: string | null,
    fileBlock = "",
    memoryPrompt = userPrompt,
    onSearchStart?: () => Promise<void> | void,
    images?: string[],
  ): Promise<{ answer: string; model: string }> {
    const history = this.store.getMessages(scope, this.config.maxHistoryMessages, this.config.maxHistoryChars);

    let searchContext = "";
    if (this.searchManager.hasKeys() && this.searchManager.shouldPreSearch(userPrompt)) {
      try {
        console.log(`[WebSearch] Automatic pre-search for: "${userPrompt}"`);
        if (onSearchStart) await onSearchStart();
        const searchRes = await this.searchManager.search(userPrompt, 5);
        if (searchRes.results.length > 0 || searchRes.answer) {
          searchContext = this.searchManager.formatForPrompt(searchRes.results, userPrompt, searchRes.answer);
        }
      } catch (err) {
        console.warn("[WebSearch] Pre-search failed:", err);
      }
    }

    const previousUserText = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    const markerKey = `kb:${scope}`;
    const firstForScope = this.store.getSetting(markerKey) !== KB_VERSION;
    const hasImages = Boolean(images && images.length > 0);
    const configuredModel = this.getModelForGuild(guildId);
    const effectiveModel = hasImages
      ? (configuredModel.toLowerCase().startsWith("gemini") ? configuredModel : "gemini-2.5-flash")
      : configuredModel;
    const modelDisplayName = this.getModelBadge(effectiveModel).displayName;

    const routeResult = PromptRouter.route({
      userPrompt,
      hasFileAttachment: Boolean(fileBlock),
      searchContext,
      timeZone: this.config.dailyResetTz,
      firstForScope,
      customSystemPrompt: this.config.systemPrompt,
      previousUserText,
      modelDisplayName,
    });

    if (routeResult.matchedKnowledge.length > 0 && firstForScope) {
      this.store.setSetting(markerKey, KB_VERSION);
    }

    console.log(
      `[PromptRouter] Intent: coding=${routeResult.intent.isCoding}, stealthx=${routeResult.intent.isStealthX}, temporal=${routeResult.intent.isTemporal} | lang=${routeResult.language} | Blocks: [${routeResult.injectedBlocks.join(", ")}] | Est tokens: ${routeResult.estimatedTokens}`
    );

    const userMessage: ChatMessage = {
      role: "user",
      content: fileBlock ? `${userPrompt}\n\n${fileBlock}` : userPrompt,
      ...(hasImages ? { images } : {}),
    };

    const messages: ChatMessage[] = [
      { role: "system", content: routeResult.systemPrompt },
      ...history,
      userMessage,
    ];

    console.log(`AI request | guild=${guildId ?? "dm"} | model=${effectiveModel} | images=${images?.length ?? 0} | transport=cloudflare-gateway`);

    const response = await fetch(`${this.config.aiGatewayUrl.replace(/\/$/, "")}/v1/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(this.config.aiGatewayTimeoutMs),
      headers: {
        Authorization: `Bearer ${this.config.aiGatewayToken}`,
        "Content-Type": "application/json",
        "User-Agent": AI_GATEWAY_USER_AGENT,
      },
      body: JSON.stringify({ model: effectiveModel, messages, stream: false }),
    });

    const bodyText = await response.text();
    let body: OllamaChatResponse = {};
    try {
      body = JSON.parse(bodyText) as OllamaChatResponse;
    } catch {}

    if (!response.ok) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? body.retryAfter ?? 0);
      const detail = body.error || `AI gateway HTTP ${response.status}`;
      console.error(`AI gateway error | status=${response.status} | ${detail}`);
      throw new UserFacingError(
        retryAfter > 0
          ? `The AI is rate-limited right now. Please try again in about ${formatDuration(retryAfter * 1000)}.`
          : "The AI service is unavailable right now. Please try again in a moment.",
      );
    }

    let answer = body.message?.content?.trim();
    if (!answer) throw new Error("AI gateway returned a response without message.content.");

    let searchRound = 0;
    const maxSearchRounds = 2;
    const iterativeMessages: ChatMessage[] = [...messages];

    while (searchRound < maxSearchRounds && this.searchManager.hasKeys()) {
      const aiSearchQuery = this.searchManager.extractSearchTrigger(answer);
      if (!aiSearchQuery) break;

      searchRound += 1;
      console.log(`[WebSearch] AI-initiated web search (round ${searchRound}/${maxSearchRounds}): "${aiSearchQuery}"`);

      try {
        if (onSearchStart) await onSearchStart();
        const searchRes = await this.searchManager.search(aiSearchQuery, 5);
        const searchBlock = this.searchManager.formatForPrompt(searchRes.results, aiSearchQuery, searchRes.answer);

        iterativeMessages.push(
          { role: "assistant", content: `SEARCH: ${aiSearchQuery}` },
          {
            role: "user",
            content: (searchRes.results.length > 0 || searchRes.answer)
              ? `${searchBlock}\n\n${buildSearchFollowUp(routeResult.language)}`
              : `No web search results were found for "${aiSearchQuery}". Please provide the best answer you can based on your knowledge.`,
          }
        );

        const followUpResponse = await fetch(`${this.config.aiGatewayUrl.replace(/\/$/, "")}/v1/chat`, {
          method: "POST",
          signal: AbortSignal.timeout(this.config.aiGatewayTimeoutMs),
          headers: {
            Authorization: `Bearer ${this.config.aiGatewayToken}`,
            "Content-Type": "application/json",
            "User-Agent": AI_GATEWAY_USER_AGENT,
          },
          body: JSON.stringify({ model: effectiveModel, messages: iterativeMessages, stream: false }),
        });

        if (followUpResponse.ok) {
          const followUpBodyText = await followUpResponse.text();
          const followUpBody = JSON.parse(followUpBodyText) as OllamaChatResponse;
          const followUpAnswer = followUpBody.message?.content?.trim();
          if (followUpAnswer) {
            answer = followUpAnswer;
          } else {
            break;
          }
        } else {
          break;
        }
      } catch (err) {
        console.warn(`[WebSearch] Follow-up search round ${searchRound} failed:`, err);
        break;
      }
    }

    const finalAnswer = sanitizeLanguageContamination(answer, routeResult.language);
    this.store.saveConversation(scope, memoryPrompt, finalAnswer);
    this.store.trimConversationScopes(this.config.maxConversationScopes);
    return { answer: finalAnswer, model: body.model || effectiveModel };
  }

  private async fetchGatewayStatus(): Promise<GatewayStatusResponse> {
    try {
      const response = await fetch(`${this.config.aiGatewayUrl.replace(/\/$/, "")}/v1/status`, {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(this.config.aiGatewayTimeoutMs, 15_000)),
        headers: {
          Authorization: `Bearer ${this.config.aiGatewayToken}`,
          "User-Agent": AI_GATEWAY_USER_AGENT,
        },
      });
      const text = await response.text();
      let body: GatewayStatusResponse = { ok: false };
      try {
        body = JSON.parse(text) as GatewayStatusResponse;
      } catch {}
      if (!response.ok) return { ...body, ok: false, error: body.error || `HTTP ${response.status}` };
      return body;
    } catch (error) {
      return {
        ok: false,
        error: String(error instanceof Error ? error.message : error).replace(/^Error:\s*/, ""),
      };
    }
  }

  private async statusText(guildId?: string | null): Promise<string> {
    const mem = process.memoryUsage();
    const stats = this.store.getStats();
    let storageBytes = 0;
    try {
      storageBytes = (await stat(STORAGE_PATH)).size;
    } catch {}
    const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    const gateway = await this.fetchGatewayStatus();
    const keyStatus = gateway.ok && gateway.keys?.length
      ? gateway.keys.map((x) => {
          if (x.state === "ready") return `Key ${x.index}: ready`;
          const until = x.cooldownUntil ? ` until ${new Date(x.cooldownUntil).toISOString()}` : "";
          const label = x.limitType ? ` (${x.limitType})` : "";
          return `Key ${x.index}: ${x.state}${label}${until}`;
        }).join("\n")
      : `AI gateway status unavailable${gateway.error ? `: ${gateway.error}` : "."}`;
    const clientStatus = this.client.isReady() ? "connected" : "disconnected";
    const uptime = this.client.uptime ? `${Math.floor(this.client.uptime / 1000)}s` : "0s";
    const poolSummary = gateway.ok && typeof gateway.ready === "number" && typeof gateway.total === "number"
      ? `${gateway.ready}/${gateway.total} ready`
      : "unavailable";
    return [
      "**StealthAI Status**",
      `Transport: Discord Gateway`,
      `Gateway: ${clientStatus}`,
      `AI Gateway: ${gateway.ok ? "connected" : "unavailable"} (${poolSummary})`,
      `Uptime: ${uptime}`,
      `Server model: **${this.getModelBadge(this.getModelForGuild(guildId)).displayName}**`,
      `Daily limit: **${this.getDailyLimitForGuild(guildId)} messages/user/day**`,
      `Prefix: \`${this.config.prefix}\``,
      `Mention chat: enabled`,
      `AI concurrency: ${this.activeAiRequests}/${this.config.maxConcurrentAi}`,
      `Process memory: RSS ${mb(mem.rss)} | Heap ${mb(mem.heapUsed)}/${mb(mem.heapTotal)}`,
      `Stored memory: ${stats.scopes} scopes | ${stats.messages} messages | ${stats.dailyUsageEntries} usage entries`,
      `State file: ${mb(storageBytes)}`,
      `KB: \`${KB_VERSION}\``,
      `Web search: ${this.searchManager.hasKeys() ? "active (Tavily)" : "disabled"}`,
      keyStatus,
    ].join("\n");
  }

  private helpText(admin = false): string {
    const p = this.config.prefix;
    const lines = [
      "**StealthAI Commands**",
      "`/ask prompt:` — ask the AI",
      "`/chat message:` — chat with the AI (with memory)",
      `\`${p}question\` — chat with the AI`,
      `@bot question — chat with the AI`,
      `\`${p}ask question\` — chat with the AI`,
      `\`${p}chat question\` — chat with the AI (with memory)`,
      `\`${p}hi\` / \`/hi\` — check that the bot is responding`,
      `\`${p}reset\` / \`/reset\` — clear your chat memory in this channel`,
      "`/obf` — obfuscate Lua/LuaU code",
    ];
    if (admin) {
      lines.push(
        "",
        "**Admin**",
        `\`${p}models\` / \`/models\` — list available models`,
        `\`${p}model\` / \`/model\` — show the active model`,
        `\`${p}status\` / \`/status\` — bot status`,
        `\`${p}ai-model <model>\`, \`${p}ai-limit <1-20>\`, \`${p}ai-clear-memory\`, \`${p}ai-status\``,
      );
    }
    return lines.join("\n");
  }

  private async replySlashError(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(content).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {});
    }
  }
}

function makeConfig(): BotConfig {
  const token = envString("DISCORD_BOT_TOKEN");
  const applicationId = envString("DISCORD_APPLICATION_ID", envString("DISCORD_CLIENT_ID"));
  const guildId = envString("DISCORD_GUILD_ID");
  const prefix = envString("BOT_PREFIX", "!").slice(0, 5) || "!";
  const aiGatewayUrl = envString("AI_GATEWAY_URL");
  const aiGatewayToken = envString("AI_GATEWAY_TOKEN");

  if (!token) throw new Error("DISCORD_BOT_TOKEN is not configured.");
  if (!guildId) throw new Error("DISCORD_GUILD_ID is not configured.");
  if (!aiGatewayUrl) throw new Error("AI_GATEWAY_URL is not configured.");
  if (!aiGatewayToken) throw new Error("AI_GATEWAY_TOKEN is not configured.");

  return {
    token,
    applicationId,
    guildId,
    adminIds: parseCsv(envString("DISCORD_ADMIN_USER_IDS")),
    prefix,
    defaultModel: envString("DEFAULT_MODEL", "gemma4:31b"),
    aiGatewayUrl,
    aiGatewayToken,
    systemPrompt: SYSTEM_PROMPT,
    defaultDailyLimit: clampInt(process.env.DEFAULT_DAILY_LIMIT, 15, 1, 20),
    dailyResetTz: envString("DAILY_RESET_TZ", "Asia/Jakarta"),
    maxHistoryMessages: clampInt(process.env.MAX_HISTORY_MESSAGES, 10, 0, 20),
    maxHistoryChars: clampInt(process.env.MAX_HISTORY_CHARS, 6000, 1000, 12000),
    maxResponseChars: clampInt(process.env.MAX_RESPONSE_CHARS, 1900, 1000, 1950),
    maxConversationScopes: clampInt(process.env.MAX_CONVERSATION_SCOPES, 100, 20, 500),
    maxConcurrentAi: clampInt(process.env.MAX_CONCURRENT_AI, 2, 1, 4),
    aiGatewayTimeoutMs: clampInt(process.env.AI_GATEWAY_TIMEOUT_MS, 75000, 10000, 120000),
  };
}

async function main(): Promise<void> {
  const config = makeConfig();
  const bot = new StealthBot(config);
  await bot.start();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
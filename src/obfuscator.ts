import {
  type ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

type PrometheusLog = { level: string; message: string };
type PrometheusResult = {
  ok: boolean;
  output?: string;
  error?: string;
  logs?: PrometheusLog[];
};

type PrometheusApi = {
  runPrometheus: (options: {
    source: string;
    filename: string;
    preset: string;
    luaVersion: string;
    prettyPrint: boolean;
    seed: number;
  }) => Promise<PrometheusResult>;
  PRESETS: readonly string[];
  LUA_VERSIONS: readonly string[];
};

// Prometheus is intentionally kept as CommonJS because its internal Lua loader
// relies on __dirname and require(). The unified bot itself runs through tsx.
const {
  runPrometheus,
  PRESETS,
  LUA_VERSIONS,
} = require("./prometheus.js") as PrometheusApi;

const LUA_VERSION_LABELS: Record<string, string> = {
  Lua51: "Lua 5.1",
  LuaU: "LuaU (Roblox)",
};

const COLOR_ERROR = 0x992222;
const COLOR_SUCCESS = 0x000000;
const WATERMARK = "Stealth-X Obfuscator";

function createObfSuccessPayload({
  sourceName,
  preset,
  outputFilename,
}: {
  sourceName: string;
  preset: string;
  luaVersion?: string;
  seed?: number;
  ratio?: string;
  outputLength?: number;
  outputFilename?: string;
}): any {
  const containerComponents: any[] = [
    {
      type: 10, // TextDisplay (Heading)
      content: `## Obfuscation Complete <:tick:1555773804095995964>\n**${sourceName}** obfuscated with hardened **${preset}**`,
    },
  ];

  if (outputFilename) {
    containerComponents.push(
      {
        type: 14, // Separator
        spacing: 2,
      },
      {
        type: 13, // File component (renders native download card in Components V2)
        file: {
          url: `attachment://${outputFilename}`,
        },
        spoiler: false,
      },
    );
  }

  containerComponents.push(
    {
      type: 14, // Separator
      spacing: 2,
    },
    {
      type: 10, // TextDisplay (Footer)
      content: `-# ${WATERMARK}`,
    },
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: containerComponents,
      },
    ],
  };
}

function createObfErrorPayload(title: string, message: string): any {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: [
          {
            type: 10, // TextDisplay
            content: `<:close:1555770497290080277> **${title}**\n${message}\n\n-# ${WATERMARK}`,
          },
        ],
      },
    ],
  };
}

const MAX_CODE_LENGTH = Number.parseInt(process.env.MAX_CODE_LENGTH || "1000000", 10);
const MAX_FILE_SIZE = Number.parseInt(process.env.MAX_FILE_SIZE || "5000000", 10);
const MAX_OBF_QUEUE = Math.max(0, Number.parseInt(process.env.MAX_OBF_QUEUE || "2", 10));
const OBF_TIMEOUT_MS = Math.max(10_000, Number.parseInt(process.env.OBF_TIMEOUT_MS || "120000", 10));

const ALLOWED_CHANNELS_OBF = process.env.DISCORD_ALLOWED_CHANNEL_ID_OBF
  ? process.env.DISCORD_ALLOWED_CHANNEL_ID_OBF.split(",").map((id) => id.trim()).filter(Boolean)
  : null;

const ALLOWED_ROLES = process.env.DISCORD_ALLOWED_ROLE_ID
  ? process.env.DISCORD_ALLOWED_ROLE_ID.split(",").map((id) => id.trim()).filter(Boolean)
  : null;

const obfuscateCommand = new SlashCommandBuilder()
  .setName("obf")
  .setDescription("Obfuscate Lua/LuaU code using Stealth-X")
  .addAttachmentOption((opt) =>
    opt
      .setName("file")
      .setDescription("Upload a .lua file to obfuscate")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("code")
      .setDescription("Or paste Lua code directly")
      .setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("preset")
      .setDescription("Obfuscation preset (default: Standard)")
      .setRequired(false)
      .addChoices(
        { name: "Minify", value: "Minify" },
        { name: "Weak", value: "Weak" },
        { name: "Standard (Roblox)", value: "Standard" },
        { name: "Strong", value: "Strong" },
        { name: "Maximum", value: "Maximum" },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("lua_version")
      .setDescription("Target Lua version (default: LuaU / Roblox)")
      .setRequired(false)
      .addChoices(
        { name: "Lua 5.1", value: "Lua51" },
        { name: "LuaU (Roblox)", value: "LuaU" },
      ),
  )
  .addBooleanOption((opt) =>
    opt
      .setName("pretty_print")
      .setDescription("Pretty-print the output (default: false)")
      .setRequired(false),
  )
  .addIntegerOption((opt) =>
    opt
      .setName("seed")
      .setDescription("Random seed for reproducible results")
      .setRequired(false)
      .setMinValue(1),
  );

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Generate a random "stealthx-<16 digits>.lua" filename for each obfuscated output. */
function randomOutputFilename(): string {
  const part = () => Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
  return `stealthx-${part()}${part()}.lua`;
}

const obfQueue: Array<{
  job: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];
let obfWorkerRunning = false;

function getQueueSize(): number {
  return obfQueue.length + (obfWorkerRunning ? 1 : 0);
}

function enqueueObfuscation<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (obfQueue.length >= MAX_OBF_QUEUE) {
      reject(new Error("QUEUE_FULL"));
      return;
    }

    obfQueue.push({
      job,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    void drainObfuscationQueue();
  });
}

async function drainObfuscationQueue(): Promise<void> {
  if (obfWorkerRunning) return;

  const item = obfQueue.shift();
  if (!item) return;

  obfWorkerRunning = true;
  try {
    item.resolve(await item.job());
  } catch (error) {
    item.reject(error);
  } finally {
    obfWorkerRunning = false;
    if (obfQueue.length) void drainObfuscationQueue();
  }
}

function allowedByChannel(interaction: ChatInputCommandInteraction): boolean {
  if (!ALLOWED_CHANNELS_OBF || ALLOWED_CHANNELS_OBF.length === 0) return true;
  return ALLOWED_CHANNELS_OBF.includes(interaction.channelId);
}

function allowedByRole(interaction: ChatInputCommandInteraction): boolean {
  if (!ALLOWED_ROLES || ALLOWED_ROLES.length === 0) return true;
  const member = interaction.member;
  if (!member) return false;
  const roles = member.roles;
  if (Array.isArray(roles)) {
    return ALLOWED_ROLES.some((roleId) => roles.includes(roleId));
  }
  return ALLOWED_ROLES.some((roleId) => roles.cache.has(roleId));
}

export async function handleObfuscation(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName !== "obf") return;

  if (!allowedByChannel(interaction)) {
    await interaction.reply({
      content: "This command can only be used in designated channels.",
      ephemeral: true,
    });
    return;
  }

  if (!allowedByRole(interaction)) {
    await interaction.reply({
      content: "You do not have the required role to use this command.",
      ephemeral: true,
    });
    return;
  }

  if (obfQueue.length >= MAX_OBF_QUEUE) {
    await interaction.reply({
      content: "The obfuscator is busy. Please try again in a moment.",
      ephemeral: true,
    });
    return;
  }

  const attachment = interaction.options.getAttachment("file");
  const rawCode = interaction.options.getString("code");
  const requestedPreset = interaction.options.getString("preset") ?? "Standard";
  const presetAliases: Record<string, string> = {
    Roblox: "Standard",
    Medium: "Standard",
    V2Lite: "Standard",
    V2Standard: "Standard",
    V2Maximum: "Maximum",
    Extreme: "Maximum",
  };
  const preset = presetAliases[requestedPreset] || requestedPreset;
  const luaVersion = interaction.options.getString("lua_version") ?? "LuaU";
  const prettyPrint = interaction.options.getBoolean("pretty_print") ?? false;
  const seed = interaction.options.getInteger("seed") ?? Math.floor(Math.random() * 2_147_483_646) + 1;

  if (!attachment && !rawCode) {
    await interaction.reply({
      ...createObfErrorPayload("Input Required", "Upload a **.lua** file using the `file` option, or paste code directly into the `code` option."),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("Input Required")
            .setDescription("Upload a **.lua** file using the `file` option, or paste code directly into the `code` option."),
        ],
        ephemeral: true,
      });
    });
    return;
  }

  if (!PRESETS.includes(preset)) {
    await interaction.reply({
      ...createObfErrorPayload("Invalid Preset", `Valid presets: ${PRESETS.join(", ")}`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("Invalid Preset")
            .setDescription(`Valid presets: ${PRESETS.join(", ")}`),
        ],
        ephemeral: true,
      });
    });
    return;
  }

  if (!LUA_VERSIONS.includes(luaVersion)) {
    await interaction.reply({
      ...createObfErrorPayload("Invalid Lua Version", `Valid versions: ${LUA_VERSIONS.join(", ")}`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("Invalid Lua Version")
            .setDescription(`Valid versions: ${LUA_VERSIONS.join(", ")}`),
        ],
        ephemeral: true,
      });
    });
    return;
  }

  if (attachment && attachment.size > MAX_FILE_SIZE) {
    await interaction.reply({
      ...createObfErrorPayload(
        "File Too Large",
        `Maximum file size is ${(MAX_FILE_SIZE / 1_000_000).toFixed(1)} MB. "${attachment.name}" is ${(attachment.size / 1000).toFixed(0)} KB.`,
      ),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle("File Too Large")
            .setDescription(
              `Maximum file size is ${(MAX_FILE_SIZE / 1_000_000).toFixed(1)} MB. "${attachment.name}" is ${(attachment.size / 1000).toFixed(0)} KB.`,
            ),
        ],
        ephemeral: true,
      });
    });
    return;
  }

  try {
    await (interaction.deferReply as any)({ flags: MessageFlags.IsComponentsV2 });
  } catch {
    return;
  }

  console.log(`[${new Date().toISOString()}] /obf received from ${interaction.user.tag} (queue=${getQueueSize()})`);

  try {
    await enqueueObfuscation(async () => {
      let code: string | null = null;
      let sourceName = "input.lua";

      try {
        if (attachment) {
          const response = await fetch(attachment.url);
          if (!response.ok) {
            throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
          }
          code = (await response.text()).replace(/^\uFEFF/, "");
          sourceName = attachment.name;
        } else {
          code = rawCode;
        }

        if (typeof code !== "string") throw new Error("Input source is not valid text.");

        if (code.length > MAX_CODE_LENGTH) {
          const errPayload = createObfErrorPayload(
            "Code Too Long",
            `Maximum code length is ${MAX_CODE_LENGTH.toLocaleString()} characters. Yours is ${code.length.toLocaleString()}.`,
          );
          try {
            return await interaction.editReply({
              content: null,
              embeds: [],
              ...errPayload,
            });
          } catch {
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR_ERROR)
                  .setTitle("Code Too Long")
                  .setDescription(`Maximum code length is ${MAX_CODE_LENGTH.toLocaleString()} characters. Yours is ${code.length.toLocaleString()}.`),
              ],
            });
          }
        }

        const workPromise = runPrometheus({
          source: code,
          filename: sourceName,
          preset,
          luaVersion,
          prettyPrint,
          seed,
        });

        let timedOut = false;
        const timeoutPromise = sleep(OBF_TIMEOUT_MS).then(() => {
          timedOut = true;
        });

        const result = await Promise.race([
          workPromise,
          timeoutPromise.then(() => null),
        ]);

        if (timedOut) {
          workPromise.catch(() => {});
          const errPayload = createObfErrorPayload(
            "Obfuscation Timed Out",
            `The job exceeded ${Math.round(OBF_TIMEOUT_MS / 1000)} seconds and was stopped from the user's perspective. The worker will finish releasing its resources before accepting another job.`,
          );
          try {
            await interaction.editReply({
              content: null,
              embeds: [],
              ...errPayload,
            });
          } catch {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR_ERROR)
                  .setTitle("Obfuscation Timed Out")
                  .setDescription(
                    `The job exceeded ${Math.round(OBF_TIMEOUT_MS / 1000)} seconds and was stopped from the user's perspective. The worker will finish releasing its resources before accepting another job.`,
                  ),
              ],
            });
          }
          return;
        }

        if (!result || result.ok === false) {
          const errorLogs = (result?.logs || [])
            .filter((log) => log.level === "error")
            .map((log) => log.message)
            .join("\n");
          const failMsg = `\`\`\`\n${(errorLogs || result?.error || "Prometheus failed").slice(0, 3800)}\n\`\`\`\nPreset: \`${preset}\`  |  Lua: \`${LUA_VERSION_LABELS[luaVersion] || luaVersion}\``;

          try {
            return await interaction.editReply({
              content: null,
              embeds: [],
              ...createObfErrorPayload("Obfuscation Failed", failMsg),
            });
          } catch {
            return interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(COLOR_ERROR)
                  .setTitle("Obfuscation Failed")
                  .setDescription(`\`\`\`\n${(errorLogs || result?.error || "Prometheus failed").slice(0, 4000)}\n\`\`\``)
                  .setFooter({
                    text: `Preset: ${preset}  |  Lua: ${LUA_VERSION_LABELS[luaVersion] || luaVersion}`,
                  }),
              ],
            });
          }
        }

        const output = result.output ?? "";
        const ratio = code.length ? ((output.length / code.length) * 100).toFixed(1) : "0.0";
        const outputBuffer = Buffer.from(output, "utf-8");
        const outputFilename = randomOutputFilename();
        const files = [{ attachment: outputBuffer, name: outputFilename }];

        const fallbackEmbed = new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle("Obfuscation Complete")
          .setDescription(`**${sourceName}** obfuscated with hardened **${preset}**`)
          .setFooter({ text: WATERMARK });

        try {
          return await interaction.editReply({
            content: null,
            embeds: [],
            ...createObfSuccessPayload({
              sourceName,
              preset,
              outputFilename,
            }),
            files,
          });
        } catch (error) {
          console.warn("Failed to edit obfuscation reply with Components V2, falling back to embed:", error);
          return await interaction.editReply({
            content: null,
            components: [],
            embeds: [fallbackEmbed],
            files,
          });
        }
      } catch (error) {
        console.error("Obfuscation job error:", error);
        const errMsg = `\`\`\`\n${String(error instanceof Error ? error.message : error).slice(0, 3800)}\n\`\`\``;
        try {
          return await interaction.editReply({
            content: null,
            embeds: [],
            ...createObfErrorPayload("Obfuscation Error", errMsg),
          });
        } catch {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR_ERROR)
                .setTitle("Obfuscation Error")
                .setDescription(`\`\`\`\n${String(error instanceof Error ? error.message : error).slice(0, 4000)}\n\`\`\``),
            ],
          });
        }
      } finally {
        code = null;
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "QUEUE_FULL") {
      const qPayload = createObfErrorPayload("Obfuscator Busy", "The obfuscator is busy. Please try again in a moment.");
      await interaction.editReply({
        content: null,
        embeds: [],
        ...qPayload,
      }).catch(() => {
        return interaction.editReply({ content: "The obfuscator is busy. Please try again in a moment." });
      });
      return;
    }

    console.error("Obfuscator interaction error:", error);
    if (interaction.deferred || interaction.replied) {
      const errMsg = `\`\`\`\n${String(error instanceof Error ? error.stack || error.message : error).slice(0, 3800)}\n\`\`\``;
      await interaction.editReply({
        content: null,
        embeds: [],
        ...createObfErrorPayload("Internal Error", errMsg),
      }).catch(() => {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle("Internal Error")
              .setDescription(`\`\`\`\n${String(error instanceof Error ? error.stack || error.message : error).slice(0, 4000)}\n\`\`\``),
          ],
        }).catch(() => {});
      });
    }
  }
}

export function registerObfuscator(client: Client): void {
  client.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleObfuscation(client, interaction).catch((error) => {
      console.error("Obfuscator handler failed:", error);
    });
  });
}

export function getObfuscateCommand() {
  return obfuscateCommand;
}

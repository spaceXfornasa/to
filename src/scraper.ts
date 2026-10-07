import {
  AttachmentBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  type Message,
  SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";

const { detectPlatform } = require("./scraper/services/platform-detector");
const { extract } = require("./scraper/services/scraper-service");
const { downloadMediaStream } = require("./scraper/services/downloader-service");
const { isValidUrl, extractUrls, cleanUrl } = require("./scraper/utils/validation");
const {
  isChannelAllowed,
  isMemberAllowed,
  getChannelRestrictionNotice,
  getRoleRestrictionNotice,
} = require("./scraper/utils/permissions");
const { EMOJIS } = require("./scraper/utils/emojis");
const {
  createErrorPayload,
  createSuccessPayload,
  createFallbackPayload,
  createAutoDetectPrompt,
  WATERMARK,
} = require("./scraper/utils/components-v2");
const rateLimiter = require("./scraper/utils/rate-limiter");
const logger = require("./scraper/utils/logger");
const { cacheUrl, getCachedUrl } = require("./scraper/utils/url-cache");
const config = require("./scraper/config");

export function getDownloadCommand(): SlashCommandBuilder | SlashCommandOptionsOnlyBuilder {
  return new SlashCommandBuilder()
    .setName("download")
    .setDescription("Download media or resolve links from TikTok, YouTube, Instagram, Spotify, etc.")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Media URL or link to extract")
        .setRequired(true),
    );
}

export function getPingCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot responsiveness and Discord API latency");
}

export async function handleDownloadCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const startTime = Date.now();
  const userId = interaction.user.id;
  const username = interaction.user.tag || interaction.user.username;

  // 1. Channel check
  if (!isChannelAllowed(interaction.channelId)) {
    await interaction.reply({
      content: getChannelRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 2. Role check
  if (!isMemberAllowed(interaction.member)) {
    await interaction.reply({
      content: getRoleRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawUrl = interaction.options.getString("url", true);

  // 3. Defer reply with Components V2 flag (native thinking state)
  await (interaction.deferReply as any)({ flags: MessageFlags.IsComponentsV2 });

  // 4. Rate limit check
  const limitStatus = rateLimiter.check(userId);
  if (!limitStatus.allowed) {
    const waitSeconds = Math.ceil(limitStatus.remainingMs / 1000);
    logger.logExtraction({
      command: "/download",
      userId,
      username,
      platform: "unknown",
      success: false,
      executionTimeMs: Date.now() - startTime,
      error: "Rate limited",
    });

    await interaction.editReply(
      createErrorPayload(`Rate limit exceeded. Please wait **${waitSeconds}s** before trying again.`),
    );
    return;
  }

  // 5. URL validation
  if (!isValidUrl(rawUrl)) {
    logger.logExtraction({
      command: "/download",
      userId,
      username,
      platform: "unknown",
      success: false,
      executionTimeMs: Date.now() - startTime,
      error: "Invalid URL syntax",
    });

    await interaction.editReply(
      createErrorPayload("Invalid URL format. Please provide a full link (e.g. `https://...`)."),
    );
    return;
  }

  const targetUrl = cleanUrl(rawUrl);

  // 6. Platform detection
  const detected = detectPlatform(targetUrl);
  if (!detected) {
    logger.logExtraction({
      command: "/download",
      userId,
      username,
      platform: "unsupported",
      success: false,
      executionTimeMs: Date.now() - startTime,
      error: "Unsupported platform",
    });

    await interaction.editReply(
      createErrorPayload("Unsupported platform for this link."),
    );
    return;
  }

  rateLimiter.consume(userId);

  // 7. Extract media
  const scrapeResult = await extract(targetUrl, detected);

  if (!scrapeResult.status) {
    logger.logExtraction({
      command: "/download",
      userId,
      username,
      platform: detected.platform,
      extractor: "all_failed",
      success: false,
      executionTimeMs: Date.now() - startTime,
      error: scrapeResult.message,
    });

    await interaction.editReply(
      createErrorPayload(scrapeResult.message || "All fallback scrapers were unable to resolve this URL."),
    );
    return;
  }

  // 8. Download media stream if applicable
  const bestDl = scrapeResult.bestDownload;
  let fileAttachment: AttachmentBuilder | null = null;
  let cleanupFn: (() => Promise<void>) | null = null;
  let tooLargeNotice = false;

  const isStreamable =
    bestDl &&
    bestDl.url &&
    (scrapeResult.mediaType === "video" ||
      scrapeResult.mediaType === "audio" ||
      scrapeResult.mediaType === "image" ||
      bestDl.type === "video" ||
      bestDl.type === "audio" ||
      bestDl.type === "image");

  if (isStreamable) {
    const dlRes = await downloadMediaStream(bestDl.url, {
      mediaType: scrapeResult.mediaType || bestDl.type || "video",
      suggestedFilename: scrapeResult.title
        .replace(/[^a-zA-Z0-9_\-]/g, "_")
        .substring(0, 40),
    });

    if (dlRes.success && dlRes.filePath) {
      fileAttachment = new AttachmentBuilder(dlRes.filePath, { name: dlRes.fileName });
      cleanupFn = dlRes.cleanup;
    } else if (dlRes.tooLarge) {
      tooLargeNotice = true;
    }
  }

  // 9. Send response
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const responsePayload = createSuccessPayload({
    title: scrapeResult.title,
    thumbnail: scrapeResult.thumbnail,
    platformName: detected.displayName,
    platformEmoji: detected.emoji,
    quality: bestDl ? bestDl.quality : null,
    mediaType: scrapeResult.mediaType,
    userId,
    extractor: scrapeResult.extractorUsed || "direct",
    elapsed,
    targetUrl,
    directUrl: bestDl ? bestDl.url : null,
    downloads: scrapeResult.downloads || [],
    fileAttachment,
    tooLargeNotice,
  });

  try {
    await interaction.editReply(responsePayload);

    logger.logExtraction({
      command: "/download",
      userId,
      username,
      platform: detected.platform,
      extractor: scrapeResult.extractorUsed || "direct",
      success: true,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("DOWNLOAD", `Failed to send response payload: ${errorMsg}`);

    const fallbackPayload = createFallbackPayload({
      title: scrapeResult.title,
      platformName: detected.displayName,
      targetUrl,
      directUrl: bestDl ? bestDl.url : null,
      errorReason: errorMsg,
    });

    await interaction.editReply(fallbackPayload).catch(() => {});
  } finally {
    if (cleanupFn) {
      await cleanupFn().catch(() => {});
    }
  }
}

export async function handlePingCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!isChannelAllowed(interaction.channelId)) {
    await interaction.reply({
      content: getChannelRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isMemberAllowed(interaction.member)) {
    await interaction.reply({
      content: getRoleRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `${EMOJIS.process} Pinging...`,
  });

  const sent = await interaction.fetchReply();
  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
  const wsPing = interaction.client.ws.ping;

  await interaction.editReply({
    content: null,
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container
        components: [
          {
            type: 10, // TextDisplay (Heading)
            content: `## Ping Successfull ${EMOJIS.success}`,
          },
          {
            type: 14, // Separator
            spacing: 2,
          },
          {
            type: 10, // TextDisplay (Body details)
            content: `**Gateway:** \`${wsPing}ms\`\n**Roundtrip:** \`${roundtrip}ms\`\n-# ${WATERMARK}`,
          },
        ],
      },
    ],
  });
}

export async function handleScraperButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const customId = interaction.customId;
  if (!customId.startsWith("autodl:")) return false;

  // 1. Channel check
  if (!isChannelAllowed(interaction.channelId)) {
    await interaction.reply({
      content: getChannelRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  // 2. Role check
  if (!isMemberAllowed(interaction.member)) {
    await interaction.reply({
      content: getRoleRestrictionNotice(),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const cacheId = customId.split(":")[1];
  const url = getCachedUrl(cacheId);

  if (!url) {
    await interaction.reply({
      content: `${EMOJIS.failed} This button has expired. Use \`/download\` with the link instead.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const targetUrl = url;
  const userId = interaction.user.id;
  const username = interaction.user.tag || interaction.user.username;
  const startTime = Date.now();

  // Delete the original prompt to keep chat clean
  interaction.message.delete().catch(() => {});

  await (interaction.deferReply as any)({ flags: MessageFlags.IsComponentsV2 });

  // Rate limit check
  const limitStatus = rateLimiter.check(userId);
  if (!limitStatus.allowed) {
    const waitSeconds = Math.ceil(limitStatus.remainingMs / 1000);
    await interaction.editReply(
      createErrorPayload(`Rate limit exceeded. Please wait **${waitSeconds}s** before trying again.`),
    );
    return true;
  }

  rateLimiter.consume(userId);

  const detected = detectPlatform(targetUrl);
  if (!detected) {
    await interaction.editReply(createErrorPayload("Unsupported platform for this link."));
    return true;
  }

  const scrapeResult = await extract(targetUrl, detected);
  if (!scrapeResult.status) {
    await interaction.editReply(
      createErrorPayload(scrapeResult.message || "Failed to extract media."),
    );
    return true;
  }

  // Handle media stream download
  const bestDl = scrapeResult.bestDownload;
  let fileAttachment: AttachmentBuilder | null = null;
  let cleanupFn: (() => Promise<void>) | null = null;
  let tooLargeNotice = false;

  const isStreamable =
    bestDl &&
    bestDl.url &&
    (scrapeResult.mediaType === "video" ||
      scrapeResult.mediaType === "audio" ||
      scrapeResult.mediaType === "image" ||
      bestDl.type === "video" ||
      bestDl.type === "audio" ||
      bestDl.type === "image");

  if (isStreamable) {
    const dlRes = await downloadMediaStream(bestDl.url, {
      mediaType: scrapeResult.mediaType || bestDl.type || "video",
      suggestedFilename: scrapeResult.title.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 40),
    });

    if (dlRes.success && dlRes.filePath) {
      fileAttachment = new AttachmentBuilder(dlRes.filePath, { name: dlRes.fileName });
      cleanupFn = dlRes.cleanup;
    } else if (dlRes.tooLarge) {
      tooLargeNotice = true;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const responsePayload = createSuccessPayload({
    title: scrapeResult.title,
    thumbnail: scrapeResult.thumbnail,
    platformName: detected.displayName,
    platformEmoji: detected.emoji,
    quality: bestDl ? bestDl.quality : null,
    mediaType: scrapeResult.mediaType,
    userId,
    extractor: scrapeResult.extractorUsed || "direct",
    elapsed,
    targetUrl,
    directUrl: bestDl ? bestDl.url : null,
    downloads: scrapeResult.downloads || [],
    fileAttachment,
    tooLargeNotice,
  });

  try {
    await interaction.editReply(responsePayload);

    logger.logExtraction({
      command: "auto-button",
      userId,
      username,
      platform: detected.platform,
      extractor: scrapeResult.extractorUsed || "direct",
      success: true,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("BUTTON", `Failed to send button response: ${errorMsg}`);

    const fallbackPayload = createFallbackPayload({
      title: scrapeResult.title,
      platformName: detected.displayName,
      targetUrl,
      directUrl: bestDl ? bestDl.url : null,
      errorReason: errorMsg,
    });

    await interaction.editReply(fallbackPayload).catch(() => {});
  } finally {
    if (cleanupFn) {
      await cleanupFn().catch(() => {});
    }
  }

  return true;
}

export async function handleScraperMessage(message: Message): Promise<boolean> {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) return false;

  // Check if auto URL detection feature is enabled
  if (!config.features.autoUrlDetection.enabled) return false;

  // Channel and member role permissions
  if (!isChannelAllowed(message.channel.id)) return false;
  if (!isMemberAllowed(message.member)) return false;

  // Fast check: message must contain http or https
  if (!message.content.includes("http://") && !message.content.includes("https://")) {
    return false;
  }

  const urls = extractUrls(message.content);
  if (urls.length === 0) return false;

  // Find first supported URL
  let detectedTarget: any = null;
  for (const url of urls) {
    const detected = detectPlatform(url);
    if (detected) {
      detectedTarget = detected;
      break;
    }
  }

  if (!detectedTarget) return false;

  const cacheId = cacheUrl(detectedTarget.url);
  const promptPayload = createAutoDetectPrompt({
    detected: detectedTarget,
    authorId: message.author.id,
    cacheId,
  });

  try {
    const promptMsg = await message.reply({
      ...promptPayload,
      allowedMentions: { repliedUser: false },
    });

    // Auto-delete prompt after 30 seconds if not clicked to keep channel clean
    setTimeout(() => {
      promptMsg.delete().catch(() => {});
    }, 30000);

    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("MESSAGE", `Could not send auto URL prompt: ${errorMsg}`);
    return false;
  }
}

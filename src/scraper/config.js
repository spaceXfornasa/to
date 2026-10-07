const path = require("path");
require("dotenv").config();

const config = {
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || "",
    clientId: process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || "",
    guildId: process.env.DISCORD_GUILD_ID || "",
  },
  bot: {
    maxFileSizeBytes: parseInt(
      process.env.MAX_FILE_SIZE_MB
        ? String(parseInt(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024)
        : "25690112",
      10,
    ),
    scraperTimeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS || "25000", 10),
    downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || "60000", 10),
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || "3", 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "30000", 10),
  },
  features: {
    autoUrlDetection: {
      enabled: process.env.ENABLE_AUTO_URL !== "false",
      mode: process.env.AUTO_URL_MODE || "button",
    },
  },
  permissions: {
    allowedChannels: (
      process.env.DISCORD_ALLOWED_CHANNEL_ID_SCRAPER ||
      process.env.BOT_CHANNEL_ID ||
      process.env.ALLOWED_CHANNELS ||
      ""
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allowedRoles: (
      process.env.DISCORD_ALLOWED_ROLE_ID_SCRAPER ||
      process.env.BOT_ROLE_ID ||
      process.env.DISCORD_ALLOWED_ROLE_ID ||
      ""
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  paths: {
    tempDir: path.resolve(
      process.env.TEMP_DIR || path.join(__dirname, "../../temp"),
    ),
  },
};

module.exports = config;


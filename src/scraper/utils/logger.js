/**
 * Universal Logger for Scrapr Discord Bot
 * Supports formatted logging with automatic redaction of sensitive credentials.
 */

const SENSITIVE_PATTERNS = [
  /token=[a-zA-Z0-9_\-\.]+/gi,
  /auth=[a-zA-Z0-9_\-\.]+/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /sessionid=[a-zA-Z0-9_\-]+/gi,
  /cookie:\s*[^;\r\n]+/gi,
];

function sanitize(message) {
  if (typeof message !== "string") {
    try {
      message = JSON.stringify(message);
    } catch (_) {
      message = String(message);
    }
  }

  // Scrub known patterns
  let clean = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, "[REDACTED]");
  }

  // Redact potential bot token (e.g. standard Discord token format)
  clean = clean.replace(
    /[MNO][a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,38}/g,
    "[REDACTED_BOT_TOKEN]",
  );

  return clean;
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
}

const logger = {
  info(scope, message, ...args) {
    console.log(
      `[${getTimestamp()}] [INFO] [${scope}] ${sanitize(message)}`,
      ...args.map((a) => sanitize(a)),
    );
  },

  warn(scope, message, ...args) {
    console.warn(
      `[${getTimestamp()}] [WARN] [${scope}] ${sanitize(message)}`,
      ...args.map((a) => sanitize(a)),
    );
  },

  error(scope, message, error = null) {
    const errorMsg = error ? ` Error: ${error.message || error}` : "";
    console.error(
      `[${getTimestamp()}] [ERROR] [${scope}] ${sanitize(message)}${errorMsg}`,
    );
    if (error && error.stack) {
      // Print stack trace safely to server logs (never exposed to Discord clients)
      console.error(`[${getTimestamp()}] [STACK] [${scope}]`, error.stack);
    }
  },

  debug(scope, message, ...args) {
    if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
      console.debug(
        `[${getTimestamp()}] [DEBUG] [${scope}] ${sanitize(message)}`,
        ...args.map((a) => sanitize(a)),
      );
    }
  },

  /**
   * Logs an extraction/download operation with all audit requirements
   */
  logExtraction({
    command = "download",
    userId,
    username,
    platform,
    extractor,
    success,
    executionTimeMs,
    error = null,
  }) {
    const statusText = success ? "SUCCESS" : "FAILURE";
    const userTag = username ? `${username} (${userId})` : userId || "Unknown";
    const timeFormatted =
      executionTimeMs !== undefined ? `${executionTimeMs}ms` : "-";
    const errorInfo = error ? ` | Error: ${error.message || error}` : "";

    const logMessage = `Command: ${command} | User: ${userTag} | Platform: ${platform} | Extractor: ${extractor || "none"} | Status: ${statusText} | ExecutionTime: ${timeFormatted}${errorInfo}`;

    if (success) {
      this.info("AUDIT", logMessage);
    } else {
      this.warn("AUDIT", logMessage);
    }
  },
};

module.exports = logger;


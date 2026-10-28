const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("./logger");

/**
 * Ensures temporary directory exists
 */
function ensureTempDir() {
  const dir = config.paths.tempDir;
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      logger.info("CLEANUP", `Created temp directory at: ${dir}`);
    } catch (err) {
      logger.error("CLEANUP", `Failed to create temp directory: ${dir}`, err);
    }
  }
  return dir;
}

/**
 * Safely deletes a file with error handling
 * @param {string} filePath
 */
async function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.debug("CLEANUP", `Removed temporary file: ${path.basename(filePath)}`);
    }
  } catch (err) {
    // Graceful error logging - do not crash the bot
    logger.warn(
      "CLEANUP",
      `Failed to delete temporary file: ${path.basename(filePath)}. Reason: ${err.message}`,
    );
  }
}

/**
 * Clean up orphaned files in the temp directory older than maxAgeMs
 * @param {number} maxAgeMs Defaults to 15 minutes
 */
async function cleanOrphanedFiles(maxAgeMs = 15 * 60 * 1000) {
  const dir = config.paths.tempDir;
  if (!fs.existsSync(dir)) return;

  try {
    const files = await fs.promises.readdir(dir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stats = await fs.promises.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(filePath);
          cleanedCount++;
        }
      } catch (err) {
        // Ignored, might be in use or deleted concurrently
      }
    }

    if (cleanedCount > 0) {
      logger.info("CLEANUP", `Cleaned up ${cleanedCount} orphaned temporary file(s).`);
    }
  } catch (err) {
    logger.error("CLEANUP", "Error during orphaned files cleanup", err);
  }
}

/**
 * Register process handlers to ensure temp files are swept on shutdown
 */
function registerExitCleanup() {
  const cleanupSync = () => {
    const dir = config.paths.tempDir;
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(dir, file));
          } catch (_) {}
        }
      } catch (_) {}
    }
  };

  process.on("exit", cleanupSync);
}

module.exports = {
  ensureTempDir,
  safeDeleteFile,
  cleanOrphanedFiles,
  registerExitCleanup,
};


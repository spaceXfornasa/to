const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mime = require("mime-types");
const crypto = require("crypto");
const config = require("../config");
const logger = require("../utils/logger");
const { safeDeleteFile, ensureTempDir } = require("../utils/cleanup");

/**
 * Derives a clean file extension based on MIME type, Content-Disposition, URL path, and mediaType
 */
function resolveExtension(contentType, contentDisposition, targetUrl, mediaType) {
  // 1. Try extracting from Content-Disposition header (e.g. filename="video.mp4")
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(
      /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i,
    );
    if (filenameMatch && filenameMatch[1]) {
      const ext = path.extname(filenameMatch[1].trim()).toLowerCase().replace(".", "");
      if (ext && ext.length <= 4 && /^[a-z0-9]+$/i.test(ext) && ext !== "bin") {
        return ext;
      }
    }
  }

  // 2. Try Content-Type header, ignoring generic binary types
  if (contentType) {
    const cleanMime = contentType.split(";")[0].trim().toLowerCase();
    const genericBinaryMimes = [
      "application/octet-stream",
      "application/binary",
      "binary/octet-stream",
      "application/x-download",
      "application/force-download",
    ];

    if (!genericBinaryMimes.includes(cleanMime)) {
      const extFromMime = mime.extension(cleanMime);
      if (extFromMime && extFromMime !== "bin") {
        if (extFromMime === "jpeg") return "jpg";
        if (extFromMime === "mpga") return "mp3";
        return extFromMime;
      }
    }
  }

  // 3. Try extracting from URL pathname
  try {
    const parsed = new URL(targetUrl);
    const extFromPath = path.extname(parsed.pathname).toLowerCase().replace(".", "");
    if (extFromPath && extFromPath.length <= 4 && /^[a-z0-9]+$/i.test(extFromPath) && extFromPath !== "bin") {
      return extFromPath;
    }
  } catch (_) {}

  // 4. Fallback based on mediaType
  if (mediaType === "audio") return "mp3";
  if (mediaType === "image" || mediaType === "photo") return "jpg";
  if (mediaType === "video") return "mp4";
  return "mp4";
}

/**
 * Format bytes into human readable format (MB, KB, etc.)
 */
function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Downloads a media file via stream to a temporary location
 *
 * @param {string} mediaUrl Direct download URL
 * @param {object} options Options { maxSizeBytes, timeoutMs, mediaType, suggestedFilename }
 * @returns {Promise<object>} Download result
 */
async function downloadMediaStream(mediaUrl, options = {}) {
  const maxSizeBytes = options.maxSizeBytes || config.bot.maxFileSizeBytes;
  const timeoutMs = options.timeoutMs || config.bot.downloadTimeoutMs;
  const mediaType = options.mediaType || "video";

  ensureTempDir();
  const fileId = crypto.randomBytes(8).toString("hex");
  const tempBasePath = path.join(config.paths.tempDir, `scrapr-${Date.now()}-${fileId}`);

  let tempFilePath = `${tempBasePath}.tmp`;
  let writeStream = null;
  let abortController = new AbortController();

  let timeoutTimer = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await axios({
      method: "GET",
      url: mediaUrl,
      responseType: "stream",
      signal: abortController.signal,
      timeout: timeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      maxRedirects: 5,
    });

    const contentType = response.headers["content-type"] || "";
    const contentDisposition = response.headers["content-disposition"] || "";
    const contentLength = parseInt(response.headers["content-length"] || "0", 10);

    // If Content-Length header is present and exceeds Discord limit:
    // Abort IMMEDIATELY without downloading the body to save bandwidth and memory.
    if (contentLength > 0 && contentLength > maxSizeBytes) {
      clearTimeout(timeoutTimer);
      response.data.destroy();
      return {
        success: false,
        tooLarge: true,
        sizeBytes: contentLength,
        sizeFormatted: formatBytes(contentLength),
        directUrl: mediaUrl,
        message: `File size (${formatBytes(contentLength)}) exceeds Discord upload limit (${formatBytes(maxSizeBytes)}).`,
      };
    }

    const extension = resolveExtension(
      contentType,
      contentDisposition,
      mediaUrl,
      mediaType,
    );
    tempFilePath = `${tempBasePath}.${extension}`;

    // Stream to disk while counting downloaded bytes
    let downloadedBytes = 0;
    writeStream = fs.createWriteStream(tempFilePath);

    await new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxSizeBytes) {
          // File grew larger than allowed limit mid-download
          response.data.destroy();
          writeStream.destroy();
          reject(new Error("FILE_TOO_LARGE"));
        }
      });

      response.data.pipe(writeStream);

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      response.data.on("error", reject);
    });

    clearTimeout(timeoutTimer);

    let cleanBase = options.suggestedFilename
      ? options.suggestedFilename
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/[^a-zA-Z0-9_\-]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "")
      : "";
    if (!cleanBase) cleanBase = `media-${fileId}`;

    const fileName = `${cleanBase}.${extension}`;

    return {
      success: true,
      filePath: tempFilePath,
      fileName,
      sizeBytes: downloadedBytes,
      sizeFormatted: formatBytes(downloadedBytes),
      extension,
      contentType,
      directUrl: mediaUrl,
      cleanup: async () => {
        await safeDeleteFile(tempFilePath);
      },
    };
  } catch (err) {
    clearTimeout(timeoutTimer);

    // Clean up partial file
    if (writeStream) {
      try {
        writeStream.destroy();
      } catch (_) {}
    }
    await safeDeleteFile(tempFilePath);

    if (err.message === "FILE_TOO_LARGE") {
      return {
        success: false,
        tooLarge: true,
        directUrl: mediaUrl,
        message: `Media stream exceeded Discord upload limit of ${formatBytes(maxSizeBytes)}.`,
      };
    }

    if (axios.isCancel(err) || err.name === "AbortError" || err.code === "ECONNABORTED") {
      return {
        success: false,
        timeout: true,
        directUrl: mediaUrl,
        message: `Download timed out after ${timeoutMs / 1000} seconds.`,
      };
    }

    // Handle HTTP specific errors
    if (err.response) {
      const status = err.response.status;
      if (status === 403 || status === 401) {
        return {
          success: false,
          expired: true,
          directUrl: mediaUrl,
          message: "Media download link has expired or requires authorization.",
        };
      }
      if (status === 404) {
        return {
          success: false,
          notFound: true,
          directUrl: mediaUrl,
          message: "Media file was not found on remote server (HTTP 404).",
        };
      }
    }

    return {
      success: false,
      directUrl: mediaUrl,
      message: err.message || "Failed to download media file.",
    };
  }
}

module.exports = {
  downloadMediaStream,
  formatBytes,
  resolveExtension,
};

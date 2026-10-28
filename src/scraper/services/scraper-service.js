/**
 * Scraper Service Adapter
 * Integrates existing scrapr modules with automatic fallback chains, timeout protection,
 * and standardized output schema for Discord presentation.
 */

const scrapr = require("../../../lib/index");
const config = require("../config");
const logger = require("../utils/logger");

// Priority order for each platform (primary -> fallbacks)
const EXTRACTOR_CHAINS = {
  tiktok: ["snaptik", "tiktokio", "ssstik", "tikdownloader", "savetik"],
  youtube: ["ytmp3", "ytmp3gg"],
  instagram: ["direct", "indown", "snapsave", "snapinsta"],
  twitter: ["direct", "tweeload", "tvd", "savetwt"],
  facebook: ["snapsave", "fdown"],
  spotify: ["spotmate", "spotidown", "soundloaders", "spotisaver"],
  soundcloud: ["klickaud"],
  pinterest: ["direct", "pindown"],
  reddit: ["rapidsave"],
  threads: ["threadster"],
  pixiv: ["ajax"],
  rednote: ["direct"],
  bilibili: ["direct"],
  douyin: ["direct"],
  bandcamp: ["bandcampdownloader"],
  applemusic: ["aplmate"],
  terabox: ["sechno"],
  resolver: ["sfile", "safelinku", "mediafire", "sub2unlock", "rekonise", "unshorten"],
};

/**
 * Executes a function with a timeout
 */
function withTimeout(promise, ms, name) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms / 1000}s while extracting via ${name}`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Normalizes different scraper result formats into a standard structure
 */
function normalizeResult(raw, platform, extractorName) {
  const result = raw.result || {};

  // Extract title
  const title = (
    result.title ||
    result.filename ||
    result.name ||
    `${platform.toUpperCase()} Media`
  ).trim();

  // Extract thumbnail
  const thumbnail =
    result.thumbnail ||
    result.cover ||
    result.thumb ||
    (Array.isArray(result.downloads)
      ? result.downloads.find((d) => d.type === "image" || d.type === "photo")?.url
      : "") ||
    null;

  // Extract author
  let author = null;
  if (result.author) {
    if (typeof result.author === "string") {
      author = { name: result.author };
    } else if (typeof result.author === "object") {
      author = {
        name: result.author.name || result.author.username || result.author.nickName || "",
        username: result.author.username || result.author.uniqueId || "",
      };
    }
  } else if (result.user) {
    author = {
      name: result.user.name || result.user.handle || "",
      username: result.user.handle || "",
    };
  } else if (result.artist) {
    author = { name: result.artist };
  }

  // Extract type
  let mediaType = result.type || "unknown";
  if (mediaType === "photo") mediaType = "image";

  // Standardize downloads list
  let downloads = [];
  if (Array.isArray(result.downloads)) {
    downloads = result.downloads
      .filter((d) => d && (d.url || typeof d === "string"))
      .map((d) => {
        if (typeof d === "string") {
          return { url: d, quality: "Default", type: mediaType };
        }
        return {
          url: d.url,
          quality: d.quality || "Standard",
          type: d.type === "photo" ? "image" : d.type || mediaType,
          filename: d.filename,
          size: d.size,
        };
      });
  } else if (typeof result.download === "string") {
    downloads.push({
      url: result.download,
      quality: "Direct Download",
      type: mediaType,
    });
  } else if (typeof result.url === "string") {
    downloads.push({
      url: result.url,
      quality: "Direct Link",
      type: mediaType,
    });
  }

  // Choose the best download
  let bestDownload = null;
  if (downloads.length > 0) {
    // Prefer video > audio > image > file > link
    const videoDl = downloads.find((d) => d.type === "video");
    const audioDl = downloads.find((d) => d.type === "audio");
    const imageDl = downloads.find((d) => d.type === "image");
    bestDownload = videoDl || audioDl || imageDl || downloads[0];

    // If mediaType was unknown, infer from best download
    if (mediaType === "unknown" && bestDownload.type) {
      mediaType = bestDownload.type;
    }
  }

  return {
    status: true,
    platform,
    extractorUsed: extractorName,
    title,
    thumbnail,
    mediaType,
    quality: bestDownload?.quality || null,
    author,
    downloads,
    bestDownload,
    extra: {
      tracks: result.tracks || null,
      items: result.items || null,
      itemCount: result.itemCount || result.totalFiles || null,
      destinationUrl: result.destinationUrl || null,
      originalUrl: result.originalUrl || null,
    },
    raw: result,
  };
}

/**
 * Scrape URL using platform and fallback mechanisms
 * @param {string} url
 * @param {object} detectedInfo
 * @returns {Promise<object>}
 */
async function extract(url, detectedInfo) {
  const { platform, options = {} } = detectedInfo;
  const platformModule = scrapr[platform];

  if (!platformModule) {
    return {
      status: false,
      message: `No scraper module registered for platform '${platform}'.`,
    };
  }

  // Determine candidate extractors
  let candidateMethods = [];
  if (options.isPlaylist && typeof platformModule.playlist === "function") {
    candidateMethods = ["playlist"];
  } else if (options.specific && typeof platformModule[options.specific] === "function") {
    candidateMethods = [options.specific];
  } else if (EXTRACTOR_CHAINS[platform]) {
    candidateMethods = EXTRACTOR_CHAINS[platform];
  } else {
    candidateMethods = Object.keys(platformModule).filter(
      (k) => typeof platformModule[k] === "function",
    );
  }

  const errors = [];
  const timeoutMs = config.bot.scraperTimeoutMs;

  for (let i = 0; i < candidateMethods.length; i++) {
    const methodName = candidateMethods[i];
    const extractorFn = platformModule[methodName];

    if (typeof extractorFn !== "function") continue;

    const isFallback = i > 0;
    if (isFallback) {
      logger.info(
        "SCRAPER",
        `Attempting fallback ${i + 1}/${candidateMethods.length} for ${platform}: ${methodName}`,
      );
    }

    try {
      const response = await withTimeout(
        extractorFn(url),
        timeoutMs,
        `${platform}.${methodName}`,
      );

      // Validate response
      if (response && response.status === true && response.result) {
        logger.debug(
          "SCRAPER",
          `Successfully resolved ${url} using ${platform}.${methodName}`,
        );
        return normalizeResult(response, platform, methodName);
      } else {
        const errMsg = response?.message || "Invalid or empty response";
        errors.push({ method: methodName, error: errMsg });
        logger.debug(
          "SCRAPER",
          `Extractor ${platform}.${methodName} returned status false: ${errMsg}`,
        );
      }
    } catch (err) {
      errors.push({ method: methodName, error: err.message });
      logger.debug(
        "SCRAPER",
        `Extractor ${platform}.${methodName} threw error: ${err.message}`,
      );
    }
  }

  // If all extractors in the fallback chain fail
  return {
    status: false,
    platform,
    message: `All extractors failed for ${platform}.`,
    details: errors,
  };
}

module.exports = {
  extract,
  EXTRACTOR_CHAINS,
  normalizeResult,
};


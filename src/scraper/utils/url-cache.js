const crypto = require("crypto");

// In-memory cache for URLs (keeps customId under 100 chars for buttons)
const urlCache = new Map();

/**
 * Stores a URL in cache and returns a short hexadecimal ID
 * @param {string} url
 * @returns {string} Short ID
 */
function cacheUrl(url) {
  if (!url) return "";
  const id = crypto.randomBytes(6).toString("hex");
  urlCache.set(id, { url, timestamp: Date.now() });

  // Clean cache entries older than 1 hour when map grows
  if (urlCache.size > 500) {
    const oneHourAgo = Date.now() - 3600000;
    for (const [k, v] of urlCache.entries()) {
      if (v.timestamp < oneHourAgo) urlCache.delete(k);
    }
  }

  return id;
}

/**
 * Retrieves a cached URL by short ID
 * @param {string} id
 * @returns {string|null} Cached URL or null
 */
function getCachedUrl(id) {
  const item = urlCache.get(id);
  return item ? item.url : null;
}

module.exports = {
  urlCache,
  cacheUrl,
  getCachedUrl,
};


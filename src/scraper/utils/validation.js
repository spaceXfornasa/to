/**
 * Validation utilities for URLs and user input
 */

// Matches standard http:// and https:// URLs inside strings
const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  const trimmed = urlString.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function extractUrls(text) {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  // Filter and deduplicate valid URLs
  const validUrls = [];
  for (const match of matches) {
    if (isValidUrl(match) && !validUrls.includes(match)) {
      validUrls.push(match);
    }
  }
  return validUrls;
}

function cleanUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return "";
  let clean = urlString.trim();
  // Remove markdown angle brackets <https://...>
  if (clean.startsWith("<") && clean.endsWith(">")) {
    clean = clean.slice(1, -1);
  }
  return clean;
}

module.exports = {
  isValidUrl,
  extractUrls,
  cleanUrl,
};


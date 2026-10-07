/**
 * Custom Emojis for Scrapr Discord Bot
 * Configured with user server emoji IDs.
 */

const EMOJIS = {
  // Status Emojis
  success: "<:tick:1555773804095995964>",
  failed: "<:close:1555770497290080277>",
  process: "<a:electricityslack:1556145750344204418>",

  // Platform Emojis
  tiktok: "<:tiktok:1557322534783811634>",
  youtube: "<:youtube:1557322555231313960>",
  pinterest: "<:pinterest:1557322572482347112>",
  spotify: "<:spotify:1557323478154219541>",
  instagram: "<:instagram:1557323754550468668>",
  twitter: "<:logos:1557323772866854974>",
  x: "<:logos:1557323772866854974>",
  reddit: "<:reddit:1557331546413867068>",
  threads: "<:threads:1557331564902486036>",
  applemusic: "<:music:1557331525182431303>",
  douyin: "<:tiktok:1557322534783811634>",
  terabox: "<:unnamed:1557332237807128646>",
  facebook: "<:facebook:1557332593387507763>",
};

function getEmoji(key) {
  if (!key) return "";
  const normalized = String(key).toLowerCase().trim();
  return EMOJIS[normalized] || "";
}

module.exports = {
  EMOJIS,
  getEmoji,
};

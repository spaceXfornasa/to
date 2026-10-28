const { isValidUrl, cleanUrl } = require("../utils/validation");
const { EMOJIS } = require("../utils/emojis");

/**
 * Platform definitions and regex patterns for scrapr
 */
const PLATFORM_RULES = [
  {
    platform: "tiktok",
    displayName: "TikTok",
    emoji: EMOJIS.tiktok || "TikTok",
    domains: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  },
  {
    platform: "youtube",
    displayName: "YouTube",
    emoji: EMOJIS.youtube || "YouTube",
    domains: ["youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"],
    detectOptions: (url) => {
      const isPlaylist =
        url.includes("playlist?list=") ||
        (url.includes("list=") && !url.includes("watch?v="));
      return { isPlaylist };
    },
  },
  {
    platform: "instagram",
    displayName: "Instagram",
    emoji: EMOJIS.instagram || "Instagram",
    domains: ["instagram.com", "instagr.am"],
  },
  {
    platform: "twitter",
    displayName: "X (Twitter)",
    emoji: EMOJIS.x || "X",
    domains: ["twitter.com", "x.com"],
  },
  {
    platform: "facebook",
    displayName: "Facebook",
    emoji: EMOJIS.facebook || "Facebook",
    domains: ["facebook.com", "fb.watch", "fb.com", "web.facebook.com", "m.facebook.com"],
  },
  {
    platform: "spotify",
    displayName: "Spotify",
    emoji: EMOJIS.spotify || "Spotify",
    domains: ["open.spotify.com", "spotify.link", "spotify.com"],
  },
  {
    platform: "soundcloud",
    displayName: "SoundCloud",
    emoji: "",
    domains: ["soundcloud.com", "on.soundcloud.com"],
  },
  {
    platform: "pinterest",
    displayName: "Pinterest",
    emoji: EMOJIS.pinterest || "Pinterest",
    domains: ["pinterest.com", "pin.it", "pinterest.co.uk", "pinterest.ca", "pinterest.fr", "pinterest.de"],
  },
  {
    platform: "reddit",
    displayName: "Reddit",
    emoji: EMOJIS.reddit || "Reddit",
    domains: ["reddit.com", "redd.it", "v.redd.it"],
  },
  {
    platform: "threads",
    displayName: "Threads",
    emoji: EMOJIS.threads || "Threads",
    domains: ["threads.net"],
  },
  {
    platform: "pixiv",
    displayName: "Pixiv",
    emoji: "🎨",
    domains: ["pixiv.net", "pixiv.re"],
  },
  {
    platform: "rednote",
    displayName: "RedNote / 小红书",
    emoji: "📕",
    domains: ["rednote.com", "xiaohongshu.com", "xhslink.com", "xhslink.cn"],
  },
  {
    platform: "bilibili",
    displayName: "Bilibili",
    emoji: "📺",
    domains: ["bilibili.com", "b23.tv"],
  },
  {
    platform: "douyin",
    displayName: "Douyin",
    emoji: EMOJIS.douyin || EMOJIS.tiktok || "Douyin",
    domains: ["douyin.com", "v.douyin.com", "iesdouyin.com"],
  },
  {
    platform: "bandcamp",
    displayName: "Bandcamp",
    emoji: "🎶",
    domains: ["bandcamp.com"],
  },
  {
    platform: "applemusic",
    displayName: "Apple Music",
    emoji: EMOJIS.applemusic || "Apple Music",
    domains: ["music.apple.com"],
  },
  {
    platform: "terabox",
    displayName: "TeraBox",
    emoji: EMOJIS.terabox || "TeraBox",
    domains: [
      "terabox.com",
      "teraboxapp.com",
      "1024tera.com",
      "mirrobox.com",
      "nephobox.com",
      "teraboxshare.com",
      "4funbox.com",
    ],
  },
  {
    platform: "resolver",
    displayName: "Link Resolver",
    emoji: "🔗",
    match: (hostname, url) => {
      if (hostname.includes("mediafire.com")) {
        return { specific: "mediafire", displayName: "MediaFire Resolver" };
      }
      if (hostname.includes("sfile.co") || hostname.includes("sfile.mobi")) {
        return { specific: "sfile", displayName: "Sfile Resolver" };
      }
      if (hostname.includes("safelinku.com") || hostname.includes("sfl.gl")) {
        return { specific: "safelinku", displayName: "SafeLinkU Resolver" };
      }
      if (hostname.includes("sub2unlock.com") || hostname.includes("sub2unlock.net")) {
        return { specific: "sub2unlock", displayName: "Sub2Unlock Resolver" };
      }
      if (hostname.includes("rekonise.com")) {
        return { specific: "rekonise", displayName: "Rekonise Resolver" };
      }
      // Generic URL shorteners
      const shorteners = [
        "bit.ly",
        "tinyurl.com",
        "t.co",
        "dub.sh",
        "is.gd",
        "cutt.ly",
        "shorturl.at",
        "rb.gy",
        "linkvertise.com",
      ];
      if (shorteners.some((s) => hostname.endsWith(s))) {
        return { specific: "unshorten", displayName: "URL Unshortener" };
      }
      return null;
    },
  },
];

/**
 * Detects platform and associated metadata for a given URL
 * @param {string} rawUrl
 * @returns {object|null}
 */
function detectPlatform(rawUrl) {
  if (!isValidUrl(rawUrl)) return null;

  const url = cleanUrl(rawUrl);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  for (const rule of PLATFORM_RULES) {
    if (rule.match) {
      const matchRes = rule.match(hostname, url);
      if (matchRes) {
        return {
          platform: rule.platform,
          displayName: matchRes.displayName || rule.displayName,
          emoji: rule.emoji,
          url,
          options: { specific: matchRes.specific },
        };
      }
    } else if (rule.domains) {
      const matched = rule.domains.some(
        (d) => hostname === d || hostname.endsWith(`.${d}`),
      );
      if (matched) {
        const extraOptions = rule.detectOptions ? rule.detectOptions(url) : {};
        return {
          platform: rule.platform,
          displayName: rule.displayName,
          emoji: rule.emoji,
          url,
          options: extraOptions,
        };
      }
    }
  }

  return null;
}

/**
 * Returns a list of all supported platform display names
 */
function getSupportedPlatformsList() {
  return [
    "TikTok",
    "YouTube",
    "Instagram",
    "Twitter / X",
    "Spotify",
    "Facebook",
    "SoundCloud",
    "Pinterest",
    "Reddit",
    "Threads",
    "Pixiv",
    "RedNote (小红书)",
    "Bilibili",
    "Douyin",
    "Bandcamp",
    "Apple Music",
    "TeraBox",
    "MediaFire & Shortened Links",
  ];
}

module.exports = {
  detectPlatform,
  getSupportedPlatformsList,
  PLATFORM_RULES,
};


const path = require("path");
const { MessageFlags } = require("discord.js");
const { EMOJIS } = require("./emojis");
const { isValidUrl } = require("./validation");
const { cacheUrl } = require("./url-cache");

const WATERMARK = "Stealth-X Extract";

/**
 * Creates a Components V2 status payload (e.g. Extracting, Preparing)
 */
function createStatusPayload(statusText) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: [
          {
            type: 10, // TextDisplay
            content: `${statusText}\n-# ${WATERMARK}`,
          },
        ],
      },
    ],
  };
}

/**
 * Creates a Components V2 error payload
 */
function createErrorPayload(errorMessage) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: [
          {
            type: 10, // TextDisplay
            content: `${EMOJIS.failed} **Extraction Error**\n${errorMessage}\n-# ${WATERMARK}`,
          },
        ],
      },
    ],
  };
}

/**
 * Creates a full Components V2 media extraction success payload
 * Matches Discohook Components V2 layout:
 * Container (17)
 *   ├── [Optional] MediaGallery (12) (for image or thumbnail preview)
 *   ├── [Optional] Separator (14, spacing 2)
 *   ├── TextDisplay (10) (Title, Download Link, Quality, Type, User, Watermark)
 *   ├── Separator (14, spacing 2)
 *   └── ActionRow (1) with [Download] and [Source] buttons
 * Plus native video attachment playback when video file is attached.
 */
function createSuccessPayload({
  title,
  thumbnail = null,
  platformName,
  platformEmoji,
  quality,
  mediaType,
  userId,
  extractor,
  elapsed,
  tooLarge = false,
  targetUrl,
  directUrl,
  fileAttachment = null,
}) {
  const badge = platformEmoji ? `${platformEmoji} ` : "";
  const truncatedTitle =
    title && title.length > 150
      ? `${title.substring(0, 147)}...`
      : title || "Media";

  const containerComponents = [];
  const normalizedType = String(mediaType || "").toLowerCase();

  // 1. Media component (MediaGallery / File)
  if (fileAttachment) {
    const attachmentName = fileAttachment.name || "media_file";
    const ext = path.extname(attachmentName).toLowerCase();
    const isVideo =
      normalizedType === "video" ||
      [".mp4", ".mov", ".webm", ".m4v", ".mkv"].includes(ext);
    const isImage =
      normalizedType === "image" ||
      normalizedType === "photo" ||
      [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
    const isAudio =
      normalizedType === "audio" ||
      [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"].includes(ext);

    if (isVideo || isImage) {
      containerComponents.push({
        type: 12, // MediaGallery
        items: [
          {
            media: {
              url: `attachment://${attachmentName}`,
            },
          },
        ],
      });
    } else if (isAudio) {
      if (thumbnail && typeof thumbnail === "string" && isValidUrl(thumbnail)) {
        containerComponents.push({
          type: 12, // MediaGallery (Cover art)
          items: [
            {
              media: {
                url: thumbnail,
              },
            },
          ],
        });
      }
      containerComponents.push({
        type: 13, // File component
        file: {
          url: `attachment://${attachmentName}`,
        },
        spoiler: false,
      });
    } else {
      containerComponents.push({
        type: 13, // File component
        file: {
          url: `attachment://${attachmentName}`,
        },
        spoiler: false,
      });
    }
  } else if (thumbnail && typeof thumbnail === "string" && isValidUrl(thumbnail)) {
    // Only when fileAttachment is NOT present (e.g. file exceeds 25MB), embed thumbnail preview
    containerComponents.push({
      type: 12, // MediaGallery (Preview)
      items: [
        {
          media: {
            url: thumbnail,
          },
        },
      ],
    });
  }

  // 2. Separator after Media (if media component was added)
  if (containerComponents.length > 0) {
    containerComponents.push({
      type: 14, // Separator
      spacing: 2,
    });
  }

  // 3. TextDisplay content
  const contentParts = [`${badge}${truncatedTitle}`];

  if (directUrl && isValidUrl(directUrl)) {
    contentParts.push(`[Direct Download Link](${directUrl})`);
  }

  if (tooLarge) {
    contentParts.push(
      `${EMOJIS.failed} File size exceeds Discord upload limit (25MB).`,
    );
  }

  const qualityText = quality || "Normal";
  const typeText = String(mediaType || "VIDEO").toUpperCase();

  contentParts.push(
    `\nQuality: \`${qualityText}\`\nType: \`${typeText}\`\nRequested by: <@${userId}>\n-# ${WATERMARK} - ${elapsed}s - ${extractor}`,
  );

  containerComponents.push({
    type: 10, // TextDisplay
    content: contentParts.join("\n"),
  });

  // 4. ActionRow with [Download] and [Source] buttons inside container
  const buttons = [];

  if (directUrl && isValidUrl(directUrl) && directUrl.length <= 512) {
    buttons.push({
      type: 2, // Button
      style: 5, // Link
      label: "Download",
      url: directUrl,
    });
  } else if (directUrl && isValidUrl(directUrl)) {
    const cacheId = cacheUrl(directUrl);
    buttons.push({
      type: 2, // Button
      style: 1, // Primary
      label: "Download",
      custom_id: `dlurl:${cacheId}`,
    });
  }

  if (targetUrl && targetUrl.length <= 512) {
    buttons.push({
      type: 2, // Button
      style: 5, // Link
      label: "Source",
      url: targetUrl,
    });
  }

  if (buttons.length > 0) {
    containerComponents.push({
      type: 14, // Separator
      spacing: 2,
    });

    containerComponents.push({
      type: 1, // ActionRow
      components: buttons,
    });
  }

  const payload = {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: containerComponents,
      },
    ],
  };

  if (fileAttachment) {
    payload.files = [fileAttachment];
  }

  return payload;
}

/**
 * Creates a Components V2 prompt for auto-detected URLs in chat
 */
function createAutoDetectPrompt({ detected, authorId, cacheId }) {
  const badge = detected.emoji ? `${detected.emoji} ` : "";
  const buttons = [
    {
      type: 2, // Button
      style: 1, // Primary
      custom_id: `autodl:${cacheId}`,
      label: "Download Media",
    },
  ];

  if (detected.url && detected.url.length <= 512) {
    buttons.push({
      type: 2, // Button
      style: 5, // Link
      label: "Open Link",
      url: detected.url,
    });
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container (no accent_color)
        components: [
          {
            type: 10, // TextDisplay
            content: `Detected **${badge}${detected.displayName}** link from <@${authorId}>.\nExtract and download this media?\n-# ${WATERMARK}`,
          },
          {
            type: 14, // Separator
            spacing: 2,
          },
          {
            type: 1, // ActionRow
            components: buttons,
          },
        ],
      },
    ],
  };
}

module.exports = {
  createStatusPayload,
  createErrorPayload,
  createSuccessPayload,
  createAutoDetectPrompt,
  WATERMARK,
};

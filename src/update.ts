import {
  AttachmentBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { existsSync, promises as fs } from "node:fs";
import { resolve } from "node:path";

export const PRIMARY_ADMIN_ID = "482479040943357953";
export const DEFAULT_UPDATE_ROLE_ID = "1549885817550544936";
export const EMOJI_CHECK_ID = "1555773804095995964";
export const EMOJI_CLOSE_ID = "1555770497290080277";
export const EMOJI_WEBSITE_BUTTON_ID = "1556145750344204418";

export const DEFAULT_UPDATE_BANNER_URL = "https://raw.githubusercontent.com/bytecodev/CodexUI/refs/heads/main/src/components/stealthx.jpeg";
export const DEFAULT_BANNER_FILENAME = "stealthxtext.png";
export const DEFAULT_WEBSITE_URL = "https://getstealthx.site/";

export function getUpdateCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName("upd")
    .setDescription("Send a script update announcement panel (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("Script/Update title (e.g. RIDE A PET SCRIPT UPDATE)")
        .setRequired(true)
        .setMaxLength(256),
    )
    .addStringOption((opt) =>
      opt
        .setName("changelog")
        .setDescription("Changelog contents (use \\n or Enter for multiple lines)")
        .setRequired(true)
        .setMaxLength(3000),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Target channel for the announcement (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("image")
        .setDescription("Custom banner image (optional)")
        .setRequired(false),
    )
    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("Role to ping (defaults to <@&1549885817550544936>)")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("link")
        .setDescription("Website URL for the button (defaults to https://getstealthx.site/)")
        .setRequired(false),
    ) as SlashCommandBuilder;
}

export async function handleUpdateCommand(
  interaction: ChatInputCommandInteraction,
  adminIds: string[] = [],
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const isAllowedAdmin =
    interaction.user.id === PRIMARY_ADMIN_ID ||
    adminIds.includes(interaction.user.id);

  if (!isAllowedAdmin) {
    await interaction.reply({
      content: `<:close:${EMOJI_CLOSE_ID}> You are not authorized to use this command. Only the designated administrator (${PRIMARY_ADMIN_ID}) can execute this.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const titleRaw = interaction.options.getString("title", true);
  const changelogRaw = interaction.options.getString("changelog", true);
  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
  const imageOption = interaction.options.getAttachment("image");
  const roleOption = interaction.options.getRole("role");
  const linkOption = interaction.options.getString("link");

  if (!targetChannel || !("send" in targetChannel)) {
    await interaction.reply({
      content: "Invalid channel selected.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const files: AttachmentBuilder[] = [];
  let hasImage = false;
  let filename = DEFAULT_BANNER_FILENAME;

  const assetsDir = resolve(process.cwd(), "assets");
  const defaultPngPath = resolve(assetsDir, DEFAULT_BANNER_FILENAME);
  const legacyJpgPath = resolve(assetsDir, "stealthText.jpg");

  if (imageOption) {
    try {
      const res = await fetch(imageOption.url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        filename = imageOption.name || DEFAULT_BANNER_FILENAME;
        files.push(new AttachmentBuilder(buffer, { name: filename }));
        hasImage = true;
      }
    } catch (error) {
      console.warn("Failed to fetch custom image for /upd:", error);
    }
  }

  if (!hasImage) {
    if (existsSync(defaultPngPath)) {
      files.push(new AttachmentBuilder(defaultPngPath, { name: DEFAULT_BANNER_FILENAME }));
      hasImage = true;
      filename = DEFAULT_BANNER_FILENAME;
    } else if (existsSync(legacyJpgPath)) {
      files.push(new AttachmentBuilder(legacyJpgPath, { name: "stealthText.jpg" }));
      hasImage = true;
      filename = "stealthText.jpg";
    } else {
      try {
        const res = await fetch(DEFAULT_UPDATE_BANNER_URL);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(defaultPngPath, buffer).catch(() => {});
          files.push(new AttachmentBuilder(buffer, { name: DEFAULT_BANNER_FILENAME }));
          hasImage = true;
          filename = DEFAULT_BANNER_FILENAME;
        }
      } catch (error) {
        console.warn("Failed to auto-download default update banner:", error);
      }
    }
  }

  // Format Title & Role Ping
  let cleanTitle = titleRaw.trim();
  if (!cleanTitle.startsWith("#")) {
    cleanTitle = `# ${cleanTitle}`;
  }

  const roleMention = roleOption ? `<@&${roleOption.id}>` : `<@&${DEFAULT_UPDATE_ROLE_ID}>`;
  const titleContent = `${cleanTitle}\n${roleMention}`;

  // Format Changelog
  let changelogContent = changelogRaw.replace(/\\n/g, "\n").trim();
  if (!/^\s*(\*\*changelog\*\*|#+\s*changelog)/i.test(changelogContent)) {
    const lines = changelogContent.split("\n");
    const formattedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^[>\-*•]/.test(trimmed)) return trimmed;
      return `> ${trimmed}`;
    });
    changelogContent = `**Changelog:**\n${formattedLines.join("\n")}`;
  }

  const websiteUrl = linkOption?.trim() || DEFAULT_WEBSITE_URL;

  // Build Components V2
  const innerComponents: any[] = [];

  if (hasImage) {
    innerComponents.push({
      type: 12, // MediaGallery
      items: [
        {
          media: {
            url: `attachment://${filename}`,
          },
        },
      ],
    });
  }

  innerComponents.push({
    type: 10, // TextDisplay
    content: titleContent,
  });

  innerComponents.push({
    type: 14, // Separator
    spacing: 2,
  });

  innerComponents.push({
    type: 10, // TextDisplay
    content: changelogContent,
  });

  innerComponents.push({
    type: 14, // Separator
    spacing: 2,
  });

  innerComponents.push({
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        style: ButtonStyle.Link,
        label: "Visit Website",
        emoji: {
          id: EMOJI_WEBSITE_BUTTON_ID,
          name: "unknown",
          animated: true,
        },
        url: websiteUrl,
      },
    ],
  });

  const payload: any = {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container
        components: innerComponents,
      },
    ],
    files,
    allowedMentions: {
      parse: ["roles", "users"],
    },
  };

  try {
    if (targetChannel.id !== interaction.channelId) {
      await (targetChannel as any).send(payload);
      await interaction.reply({
        content: `<:check:${EMOJI_CHECK_ID}> Update announcement successfully sent to <#${targetChannel.id}>!`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error("Failed to send /upd announcement:", error);
    await interaction.reply({
      content: `<:close:${EMOJI_CLOSE_ID}> Failed to send update announcement: ${error instanceof Error ? error.message : String(error)}`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

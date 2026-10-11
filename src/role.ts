import {
  AttachmentBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { existsSync, promises as fs } from "node:fs";
import { resolve } from "node:path";

export const VERIFY_ROLE_ID = process.env.DISCORD_ALLOWED_AI_ROLE_ID?.trim() || "1549837787287654411";
export const EMOJI_CHECK_ID = "1555773804095995964";
export const EMOJI_CLOSE_ID = "1555770497290080277";
export const VERIFY_BUTTON_CUSTOM_ID = "verify_member_role";
export const DISCOHOOK_CUSTOM_ID = "p_356353929912520705";

export const DEFAULT_BANNER_URL = "https://raw.githubusercontent.com/naells/Stealth-X/refs/heads/main/img/verifybanner.png";
export const BANNER_FILENAME = "verifybanner.png";

export function getRoleCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName("role")
    .setDescription("Send the member role verification panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption((opt) =>
      opt
        .setName("image")
        .setDescription("Custom banner image for the verification panel (optional)")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the panel (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ) as SlashCommandBuilder;
}

export async function handleRoleCommand(
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

  const member = interaction.member;
  const isDiscordAdmin =
    member instanceof GuildMember &&
    member.permissions.has(PermissionFlagsBits.Administrator);
  const isConfigAdmin = adminIds.includes(interaction.user.id);

  if (!isDiscordAdmin && !isConfigAdmin) {
    await interaction.reply({
      content: "You must be an administrator to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const imageOption = interaction.options.getAttachment("image");
  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

  if (!targetChannel || !("send" in targetChannel)) {
    await interaction.reply({
      content: "Invalid channel selected.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const files: AttachmentBuilder[] = [];
  let hasImage = false;
  let filename = BANNER_FILENAME;

  const bannerPath = resolve(process.cwd(), "assets", BANNER_FILENAME);
  const legacyPath = resolve(process.cwd(), "assets", "stealthText.jpg");

  if (imageOption) {
    try {
      const res = await fetch(imageOption.url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        filename = imageOption.name || BANNER_FILENAME;
        files.push(new AttachmentBuilder(buffer, { name: filename }));
        hasImage = true;
      }
    } catch (error) {
      console.warn("Failed to fetch image option for /role:", error);
    }
  }

  if (!hasImage) {
    if (existsSync(bannerPath)) {
      files.push(new AttachmentBuilder(bannerPath, { name: BANNER_FILENAME }));
      hasImage = true;
      filename = BANNER_FILENAME;
    } else if (existsSync(legacyPath)) {
      files.push(new AttachmentBuilder(legacyPath, { name: "stealthText.jpg" }));
      hasImage = true;
      filename = "stealthText.jpg";
    } else {
      // Auto-fetch from GitHub raw URL and cache locally
      try {
        const res = await fetch(DEFAULT_BANNER_URL);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(bannerPath, buffer).catch(() => {});
          files.push(new AttachmentBuilder(buffer, { name: BANNER_FILENAME }));
          hasImage = true;
          filename = BANNER_FILENAME;
        }
      } catch (error) {
        console.warn("Failed to auto-download default banner:", error);
      }
    }
  }

  const containerComponents: any[] = [];
  if (hasImage) {
    containerComponents.push({
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

  containerComponents.push({
    type: 10, // TextDisplay
    content: `# Get Your Member Role\nClick <:check:${EMOJI_CHECK_ID}> **Verify** below to unlock the server and access its channels.\n\nWelcome aboard!`,
  });

  const payload: any = {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17, // Clean Container
        components: containerComponents,
      },
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: ButtonStyle.Primary,
            label: "Verify Here",
            emoji: {
              id: EMOJI_CHECK_ID,
              name: "check",
              animated: false,
            },
            custom_id: VERIFY_BUTTON_CUSTOM_ID,
          },
        ],
      },
    ],
    files,
  };

  try {
    if (targetChannel.id !== interaction.channelId) {
      await (targetChannel as any).send(payload);
      await interaction.reply({
        content: `<:check:${EMOJI_CHECK_ID}> Verification panel successfully sent to <#${targetChannel.id}>!`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error("Failed to send /role verification panel:", error);
    await interaction.reply({
      content: `<:close:${EMOJI_CLOSE_ID}> Failed to send verification panel: ${error instanceof Error ? error.message : String(error)}`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

export async function handleRoleButton(interaction: ButtonInteraction): Promise<boolean> {
  const customId = interaction.customId;
  if (customId !== VERIFY_BUTTON_CUSTOM_ID && customId !== DISCOHOOK_CUSTOM_ID) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "This action can only be performed inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const roleId = VERIFY_ROLE_ID;

  try {
    const member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : await interaction.guild.members.fetch(interaction.user.id);

    if (member.roles.cache.has(roleId)) {
      await interaction.reply({
        content: `<:check:${EMOJI_CHECK_ID}> **Verification Successful!**\nYou already have the <@&${roleId}> role.\n\nWelcome to the server!`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await member.roles.add(roleId);

    await interaction.reply({
      content: `<:check:${EMOJI_CHECK_ID}> **Verification Successful!**\nYou have received the <@&${roleId}> role.\n\nWelcome to the server!`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  } catch (error) {
    console.error("Error giving verification role:", error);
    await interaction.reply({
      content: `<:close:${EMOJI_CLOSE_ID}> **Verification Failed**\nFailed to assign role <@&${roleId}>. Please ensure the bot has **Manage Roles** permission and its role is positioned above the target role.\n\n-# Saviera AI`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return true;
  }
}

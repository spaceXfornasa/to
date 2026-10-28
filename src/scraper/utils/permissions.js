const { PermissionFlagsBits } = require("discord.js");
const config = require("../config");
const { EMOJIS } = require("./emojis");

/**
 * Checks if a command or action is allowed in the given channel ID
 * @param {string} channelId
 * @returns {boolean}
 */
function isChannelAllowed(channelId) {
  const allowed = config.permissions.allowedChannels;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(channelId);
}

/**
 * Checks if a GuildMember has the required role to execute bot commands
 * @param {import("discord.js").GuildMember|null} member
 * @returns {boolean}
 */
function isMemberAllowed(member) {
  const allowed = config.permissions.allowedRoles;
  if (!allowed || allowed.length === 0) return true;
  if (!member) return true;

  // Administrators can always bypass role restrictions
  if (member.permissions && typeof member.permissions.has === "function" && member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check if member.roles is an array of role IDs (raw interaction payload)
  if (Array.isArray(member.roles)) {
    return member.roles.some((roleId) => allowed.includes(roleId));
  }

  // Check if member.roles is GuildMemberRoleManager (discord.js collection)
  if (member.roles && member.roles.cache && typeof member.roles.cache.some === "function") {
    return member.roles.cache.some((role) => allowed.includes(role.id));
  }

  return false;
}

/**
 * Formats a friendly error message when channel is restricted
 */
function getChannelRestrictionNotice() {
  const allowed = config.permissions.allowedChannels;
  const mentions = allowed.map((id) => `<#${id}>`).join(", ");
  return `${EMOJIS.failed} This command can only be used in: ${mentions}`;
}

/**
 * Formats a friendly error message when role is restricted
 */
function getRoleRestrictionNotice() {
  const allowed = config.permissions.allowedRoles;
  const mentions = allowed.map((id) => `<@&${id}>`).join(", ");
  return `${EMOJIS.failed} You need the ${mentions} role to use this command.`;
}

module.exports = {
  isChannelAllowed,
  isMemberAllowed,
  getChannelRestrictionNotice,
  getRoleRestrictionNotice,
};


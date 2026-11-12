import { PermissionFlagsBits } from "discord.js";
import { createEmbed } from "../utils/embeds.js";

const recentMessages = new Map();
const LINK_PATTERN = /(?:https?:\/\/|www\.|discord\.gg\/)[^\s]+/i;
const cleanupTimer = setInterval(() => {
  const oldestAllowed = Date.now() - 60_000;
  for (const [key, timestamps] of recentMessages) {
    const recent = timestamps.filter((timestamp) => timestamp >= oldestAllowed);
    if (recent.length) recentMessages.set(key, recent);
    else recentMessages.delete(key);
  }
}, 60_000);
cleanupTimer.unref?.();

async function sendAlert(message, settings, reason) {
  const channel = settings.logChannelId
    ? message.guild.channels.cache.get(settings.logChannelId)
    : null;
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [createEmbed("Auto-modération", `${message.author.tag} dans <#${message.channelId}> : ${reason}`)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
}

async function removeMessage(message, settings, reason) {
  try {
    await message.delete();
  } catch (error) {
    console.error(`L'auto-modération n'a pas pu supprimer un message dans ${message.guild.id} :`, error);
    return false;
  }
  await sendAlert(message, settings, reason);
  const notice = await message.channel.send({
    content: `${message.author}, ton message a été supprimé par le filtre automatique.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) {
    const timer = setTimeout(() => notice.delete().catch(() => {}), 5000);
    timer.unref?.();
  }
  return true;
}

export async function handleAutomodMessage(message, store) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  const settings = store.getGuildSettings(message.guild.id);
  if (!settings.automodEnabled) return false;

  const content = message.content.toLocaleLowerCase("fr");
  const blockedWord = settings.automodBlockedWords.find((word) => word && content.includes(word));
  if (blockedWord) return removeMessage(message, settings, `mot filtré détecté (\`${blockedWord}\`)`);
  if (settings.automodLinks && LINK_PATTERN.test(message.content)) {
    return removeMessage(message, settings, "lien non autorisé");
  }

  const mentionCount = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
  if (settings.automodMentions && mentionCount > settings.automodMaxMentions) {
    return removeMessage(message, settings, `${mentionCount} mentions dans un seul message`);
  }

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const windowMs = settings.automodSpamWindowSeconds * 1000;
  const messages = (recentMessages.get(key) ?? []).filter((timestamp) => now - timestamp <= windowMs);
  messages.push(now);
  recentMessages.set(key, messages);
  if (messages.length >= settings.automodSpamThreshold) {
    recentMessages.set(key, []);
    return removeMessage(message, settings, `anti-spam (${messages.length} messages en ${settings.automodSpamWindowSeconds}s)`);
  }
  return false;
}

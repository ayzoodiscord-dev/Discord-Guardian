import { Events } from "discord.js";
import { createEmbed } from "../utils/embeds.js";

function excerpt(value, limit = 1000) {
  if (!value) return "—";
  const text = value.replace(/@/g, "@\u200b");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

async function writeLog(guild, store, embed) {
  const settings = store.getGuildSettings(guild.id);
  if (!settings.eventLogsEnabled || !settings.logChannelId) return;
  const channel = guild.channels.cache.get(settings.logChannelId)
    ?? await guild.channels.fetch(settings.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((error) => {
    console.error(`Impossible d'envoyer un journal d'événement dans ${guild.id} :`, error);
  });
}

export function registerGuildLogs(client, store) {
  client.on(Events.MessageDelete, async (message) => {
    if (message.partial) await message.fetch().catch(() => null);
    if (!message.guild || !message.author || message.author.bot) return;
    const details = `Auteur : ${message.author.tag}\nSalon : <#${message.channelId}>\nContenu : ${excerpt(message.content)}`;
    await writeLog(message.guild, store, createEmbed("Message supprimé", details));
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (oldMessage.partial) await oldMessage.fetch().catch(() => null);
    if (newMessage.partial) await newMessage.fetch().catch(() => null);
    if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const details = `Auteur : ${newMessage.author.tag}\nSalon : <#${newMessage.channelId}>\nAvant : ${excerpt(oldMessage.content)}\nAprès : ${excerpt(newMessage.content)}`;
    await writeLog(newMessage.guild, store, createEmbed("Message modifié", details));
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    const changes = [];
    if (added.size) changes.push(`Rôles ajoutés : ${added.map((role) => role.name).join(", ")}`);
    if (removed.size) changes.push(`Rôles retirés : ${removed.map((role) => role.name).join(", ")}`);
    if (oldMember.nickname !== newMember.nickname) {
      changes.push(`Pseudonyme : ${excerpt(oldMember.nickname ?? oldMember.user.username, 100)} → ${excerpt(newMember.nickname ?? newMember.user.username, 100)}`);
    }
    if (changes.length) {
      await writeLog(newMember.guild, store, createEmbed(`Membre modifié : ${newMember.user.tag}`, changes.join("\n")));
    }
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (channel.guild) await writeLog(channel.guild, store, createEmbed("Salon créé", `${channel.name} (${channel.id})`));
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (channel.guild) await writeLog(channel.guild, store, createEmbed("Salon supprimé", `${channel.name} (${channel.id})`));
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`Nom : ${oldChannel.name} → ${newChannel.name}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push("Catégorie modifiée");
    if (changes.length) await writeLog(newChannel.guild, store, createEmbed("Salon modifié", `${newChannel.name}\n${changes.join("\n")}`));
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    await writeLog(role.guild, store, createEmbed("Rôle créé", `${role.name} (${role.id})`));
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    await writeLog(role.guild, store, createEmbed("Rôle supprimé", `${role.name} (${role.id})`));
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`Nom : ${oldRole.name} → ${newRole.name}`);
    if (oldRole.color !== newRole.color) changes.push("Couleur modifiée");
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Permissions modifiées");
    if (changes.length) await writeLog(newRole.guild, store, createEmbed(`Rôle modifié : ${newRole.name}`, changes.join("\n")));
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    await writeLog(ban.guild, store, createEmbed("Membre banni", `${ban.user.tag} (${ban.user.id})`));
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    await writeLog(ban.guild, store, createEmbed("Bannissement retiré", `${ban.user.tag} (${ban.user.id})`));
  });
}

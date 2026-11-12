import { AttachmentBuilder } from "discord.js";
import { createMemberCard } from "../services/canvas.js";
import { createEmbed } from "../utils/embeds.js";

const joins = new Map();

async function sendToChannel(guild, channelId, payload) {
  if (!channelId) return false;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return false;
  await channel.send(payload);
  return true;
}

async function makeCard(member, heading, message, filename) {
  try {
    const image = await createMemberCard({ member, heading, message });
    return {
      embeds: [createEmbed(heading, message).setImage(`attachment://${filename}`)],
      files: [new AttachmentBuilder(image, { name: filename })],
    };
  } catch (error) {
    console.error("Impossible de générer une carte d'arrivée ou de départ :", error);
    return { embeds: [createEmbed(heading, message)] };
  }
}

export function registerMemberEvents(client, store) {
  client.on("guildMemberAdd", async (member) => {
    const settings = store.getGuildSettings(member.guild.id);
    const now = Date.now();
    let raidDetected = false;

    if (settings.antiRaidEnabled) {
      const previous = joins.get(member.guild.id) ?? [];
      const windowMs = settings.antiRaidWindowSeconds * 1000;
      const recent = previous.filter((timestamp) => now - timestamp <= windowMs);
      recent.push(now);
      joins.set(member.guild.id, recent);

      if (recent.length >= settings.antiRaidThreshold) {
        raidDetected = true;
        try {
          await member.timeout(10 * 60_000, "Anti-raid : arrivée groupée détectée");
          const message = `Arrivée groupée détectée : ${recent.length} membres en ${settings.antiRaidWindowSeconds} secondes. Timeout de 10 minutes appliqué à ${member.user.tag}.`;
          await sendToChannel(member.guild, settings.logChannelId, { embeds: [createEmbed("Alerte anti-raid", message)] });
        } catch (error) {
          console.error(`Le timeout anti-raid a échoué pour ${member.user.tag} :`, error);
          await sendToChannel(member.guild, settings.logChannelId, {
            embeds: [createEmbed("Alerte anti-raid", `Arrivée groupée détectée (${recent.length} membres en ${settings.antiRaidWindowSeconds} secondes), mais le timeout de ${member.user.tag} a échoué. Vérifie la hiérarchie des rôles et les permissions du bot.`)],
          });
        }
      }
    }

    if (settings.autoRoleId && !raidDetected && !member.user.bot) {
      const role = member.guild.roles.cache.get(settings.autoRoleId);
      const botMember = member.guild.members.me;
      if (role && botMember && !role.managed && role.position < botMember.roles.highest.position) {
        try {
          await member.roles.add(role, "Rôle automatique configuré par le serveur");
        } catch (error) {
          console.error(`Le rôle automatique n'a pas pu être attribué à ${member.user.tag} :`, error);
          await sendToChannel(member.guild, settings.logChannelId, {
            embeds: [createEmbed("Rôle automatique impossible", `Le rôle configuré n'a pas pu être attribué à ${member.user.tag}. Vérifie la permission Gérer les rôles et la position du rôle du bot.`)],
          });
        }
      }
    }

    if (!settings.welcomeChannelId) return;
    const message = settings.welcomeMessage
      .replaceAll("{user}", `<@${member.id}>`)
      .replaceAll("{server}", member.guild.name)
      .replaceAll("{memberCount}", `${member.guild.memberCount}`);
    const payload = await makeCard(member, `Bienvenue, ${member.displayName}`, message, "bienvenue.png");
    try {
      await sendToChannel(member.guild, settings.welcomeChannelId, payload);
    } catch (error) {
      console.error(`Le message de bienvenue n'a pas pu être envoyé dans ${member.guild.id} :`, error);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    const settings = store.getGuildSettings(member.guild.id);
    if (!settings.goodbyeChannelId) return;
    const message = settings.goodbyeMessage
      .replaceAll("{user}", member.user.tag)
      .replaceAll("{server}", member.guild.name)
      .replaceAll("{memberCount}", `${member.guild.memberCount}`);
    const payload = await makeCard(member, `Au revoir, ${member.displayName}`, message, "depart.png");
    try {
      await sendToChannel(member.guild, settings.goodbyeChannelId, payload);
    } catch (error) {
      console.error(`Le message de départ n'a pas pu être envoyé dans ${member.guild.id} :`, error);
    }
  });
}

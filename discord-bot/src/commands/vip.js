import { SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = new SlashCommandBuilder()
  .setName("vip")
  .setDescription("Accède aux avantages VIP du serveur")
  .addSubcommand((command) => command.setName("status").setDescription("Vérifie la configuration VIP et ton accès"))
  .addSubcommand((command) =>
    command
      .setName("annonce")
      .setDescription("Publie une annonce dans le salon VIP")
      .addStringOption((option) => option.setName("message").setDescription("Message à publier").setMaxLength(1000).setRequired(true)),
  );

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  const settings = store.getGuildSettings(interaction.guildId);
  const role = settings.vipRoleId ? interaction.guild.roles.cache.get(settings.vipRoleId) : null;
  const channel = settings.vipChannelId ? interaction.guild.channels.cache.get(settings.vipChannelId) : null;

  if (interaction.options.getSubcommand() === "status") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasRole = role && member.roles.cache.has(role.id);
    return respond(interaction, {
      embeds: [createEmbed("Espace VIP", role
        ? `Rôle VIP : ${role}\nSalon d'annonces : ${channel ? channel : "non disponible"}\nTon accès : **${hasRole ? "VIP" : "membre"}**`
        : "Les avantages VIP ne sont pas configurés sur ce serveur.")],
      ephemeral: true,
    });
  }

  if (!role || !channel?.isTextBased()) {
    return respond(interaction, { content: "L'espace VIP n'est pas configuré. Un administrateur peut le régler avec `/config vip`.", ephemeral: true });
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(role.id)) {
    return respond(interaction, { content: "Cette commande est réservée aux membres ayant le rôle VIP.", ephemeral: true });
  }
  const text = interaction.options.getString("message", true).replace(/@everyone|@here/g, (value) => `@\u200b${value.slice(1)}`);
  await channel.send({
    embeds: [createEmbed(`Annonce VIP de ${interaction.user.username}`, text)],
    allowedMentions: { parse: [] },
  });
  return respond(interaction, { embeds: [createEmbed("Annonce publiée", `Ton message a été envoyé dans ${channel}.`)], ephemeral: true });
}

export default { data, execute };

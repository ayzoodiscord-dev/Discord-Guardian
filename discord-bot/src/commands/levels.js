import { SlashCommandBuilder } from "discord.js";
import { createProfileCard } from "../services/canvas.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Affiche une carte de profil et le niveau")
    .addUserOption((option) => option.setName("membre").setDescription("Profil à consulter").setRequired(false)),
  new SlashCommandBuilder().setName("classement").setDescription("Affiche le classement des niveaux du serveur"),
].map((command) => command.toJSON());

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }

  if (!store.getGuildSettings(interaction.guildId).levelsEnabled) {
    return respond(interaction, { content: "Le système de niveaux est désactivé sur ce serveur.", ephemeral: true });
  }

  if (interaction.commandName === "profil") {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return respond(interaction, { content: "Ce membre n'est plus sur le serveur.", ephemeral: true });
    await interaction.deferReply();
    const progress = store.getProgress(interaction.guildId, user.id);
    try {
      const image = await createProfileCard({ member, progress });
      return interaction.editReply({
        embeds: [createEmbed(`Profil de ${member.displayName}`, `Niveau **${progress.level}** · **${progress.xp} XP** au total.`).setImage("attachment://profil.png")],
        files: [{ attachment: image, name: "profil.png" }],
      });
    } catch (error) {
      console.error("Impossible de générer la carte de profil :", error);
      return interaction.editReply({ content: "La carte de profil n'a pas pu être générée. Vérifie que l'hébergeur prend en charge Canvas et réessaie." });
    }
  }

  const leaderboard = store.getLeaderboard(interaction.guildId, 10);
  if (!leaderboard.length) {
    return respond(interaction, { embeds: [createEmbed("Classement des niveaux", "Aucune activité enregistrée pour le moment.")] });
  }
  const lines = await Promise.all(leaderboard.map(async (entry) => {
    const user = await interaction.client.users.fetch(entry.userId).catch(() => null);
    const name = user?.username ?? `Membre ${entry.userId}`;
    return `**${entry.rank}.** ${name} — niveau ${entry.level} · ${entry.xp} XP`;
  }));
  return respond(interaction, { embeds: [createEmbed("Classement des niveaux", lines.join("\n"))] });
}

export default { data, execute };

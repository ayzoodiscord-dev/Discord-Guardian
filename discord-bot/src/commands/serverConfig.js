import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const verificationLabels = {
  0: "Aucune",
  1: "Faible",
  2: "Moyenne",
  3: "Élevée",
  4: "Très élevée",
};

const data = new SlashCommandBuilder()
  .setName("serverconfig")
  .setDescription("Consulte ou modifie les réglages généraux du serveur")
  .addSubcommand((command) => command.setName("summary").setDescription("Affiche un résumé des réglages du serveur"))
  .addSubcommand((command) =>
    command
      .setName("verification")
      .setDescription("Règle le niveau de vérification des nouveaux membres")
      .addIntegerOption((option) =>
        option
          .setName("niveau")
          .setDescription("Niveau de vérification")
          .setRequired(true)
          .addChoices(
            { name: "Aucune", value: 0 },
            { name: "Faible", value: 1 },
            { name: "Moyenne", value: 2 },
            { name: "Élevée", value: 3 },
            { name: "Très élevée", value: 4 },
          ),
      ),
  );

async function execute(interaction) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "summary") {
    const guild = interaction.guild;
    return respond(interaction, {
      embeds: [createEmbed(`Configuration de ${guild.name}`, [
        `Vérification : **${verificationLabels[guild.verificationLevel] ?? "Inconnue"}**`,
        `Membres : **${guild.memberCount}**`,
        `Boosts : **${guild.premiumSubscriptionCount ?? 0}** (niveau ${guild.premiumTier})`,
        `Notifications par défaut : **${guild.defaultMessageNotifications === 1 ? "mentions uniquement" : "tous les messages"}**`,
        `Salon AFK : ${guild.afkChannel ? guild.afkChannel : "aucun"}`,
      ].join("\n"))],
      ephemeral: true,
    });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return respond(interaction, { content: "Tu dois gérer le serveur pour modifier ce réglage.", ephemeral: true });
  }
  const level = interaction.options.getInteger("niveau", true);
  await interaction.guild.edit({ verificationLevel: level });
  return respond(interaction, {
    embeds: [createEmbed("Vérification mise à jour", `Le niveau est maintenant **${verificationLabels[level]}**. Discord peut imposer un délai avant l'application complète.`)],
    ephemeral: true,
  });
}

export default { data, execute };

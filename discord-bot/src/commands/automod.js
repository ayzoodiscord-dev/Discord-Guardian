import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Configure le filtre automatique des messages")
  .addSubcommand((command) =>
    command
      .setName("config")
      .setDescription("Active les filtres et règle leurs seuils")
      .addBooleanOption((option) => option.setName("active").setDescription("Activer l'auto-modération").setRequired(true))
      .addBooleanOption((option) => option.setName("liens").setDescription("Supprimer les liens").setRequired(false))
      .addBooleanOption((option) => option.setName("mentions").setDescription("Limiter les mentions groupées").setRequired(false))
      .addIntegerOption((option) => option.setName("max_mentions").setDescription("Nombre maximum de mentions").setMinValue(2).setMaxValue(20))
      .addIntegerOption((option) => option.setName("seuil_spam").setDescription("Messages avant suppression anti-spam").setMinValue(3).setMaxValue(15))
      .addIntegerOption((option) => option.setName("fenetre_spam").setDescription("Fenêtre anti-spam en secondes").setMinValue(3).setMaxValue(30)),
  )
  .addSubcommand((command) =>
    command
      .setName("mots")
      .setDescription("Ajoute, retire ou affiche les mots filtrés")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Action à effectuer")
          .setRequired(true)
          .addChoices(
            { name: "Ajouter", value: "add" },
            { name: "Retirer", value: "remove" },
            { name: "Afficher", value: "list" },
          ),
      )
      .addStringOption((option) => option.setName("mot").setDescription("Mot à ajouter ou retirer").setMaxLength(40)),
  );

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return respond(interaction, { content: "Tu dois gérer le serveur pour configurer l'auto-modération.", ephemeral: true });
  }

  const settings = store.getGuildSettings(interaction.guildId);
  if (interaction.options.getSubcommand() === "config") {
    const changes = {
      automodEnabled: interaction.options.getBoolean("active", true),
    };
    for (const [option, key] of [
      ["liens", "automodLinks"],
      ["mentions", "automodMentions"],
      ["max_mentions", "automodMaxMentions"],
      ["seuil_spam", "automodSpamThreshold"],
      ["fenetre_spam", "automodSpamWindowSeconds"],
    ]) {
      const value = option === "liens" || option === "mentions"
        ? interaction.options.getBoolean(option)
        : interaction.options.getInteger(option);
      if (value !== null) changes[key] = value;
    }
    const updated = await store.updateGuildSettings(interaction.guildId, changes);
    return respond(interaction, {
      embeds: [createEmbed(
        "Auto-modération mise à jour",
        `Statut : **${updated.automodEnabled ? "actif" : "inactif"}**\nLiens : ${updated.automodLinks ? "filtrés" : "autorisés"}\nMentions groupées : ${updated.automodMentions ? `limitées à ${updated.automodMaxMentions}` : "non filtrées"}\nAnti-spam : ${updated.automodSpamThreshold} messages en ${updated.automodSpamWindowSeconds}s\nMots filtrés : ${updated.automodBlockedWords.length}`,
      )],
      ephemeral: true,
    });
  }

  const action = interaction.options.getString("action", true);
  const word = interaction.options.getString("mot")?.trim().toLocaleLowerCase("fr");
  const words = [...settings.automodBlockedWords];
  if (action === "list") {
    return respond(interaction, {
      embeds: [createEmbed("Mots filtrés", words.length ? words.map((item) => `• ${item}`).join("\n") : "Aucun mot filtré.")],
      ephemeral: true,
    });
  }
  if (!word) {
    return respond(interaction, { content: "Indique un mot à ajouter ou retirer.", ephemeral: true });
  }
  const existingIndex = words.indexOf(word);
  if (action === "add" && existingIndex < 0) words.push(word);
  if (action === "remove" && existingIndex >= 0) words.splice(existingIndex, 1);
  const updated = await store.updateGuildSettings(interaction.guildId, { automodBlockedWords: words.slice(0, 100) });
  return respond(interaction, {
    embeds: [createEmbed("Liste mise à jour", `${action === "add" ? "Mot ajouté" : "Mot retiré"} : **${word}**\nMots filtrés : ${updated.automodBlockedWords.length}/100`)],
    ephemeral: true,
  });
}

export default { data, execute };

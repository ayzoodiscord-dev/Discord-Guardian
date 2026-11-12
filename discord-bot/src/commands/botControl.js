import { ActivityType, SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const activities = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
};

const data = new SlashCommandBuilder()
  .setName("botcontrol")
  .setDescription("Affiche l'état du bot ou règle sa présence")
  .addSubcommand((command) => command.setName("status").setDescription("Affiche l'état de connexion du bot"))
  .addSubcommand((command) =>
    command
      .setName("presence")
      .setDescription("Change la présence globale du bot (propriétaire uniquement)")
      .addStringOption((option) => option.setName("texte").setDescription("Texte affiché sous le nom du bot").setMaxLength(128).setRequired(true))
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Type d'activité")
          .setRequired(true)
          .addChoices(
            { name: "Joue à", value: "playing" },
            { name: "Écoute", value: "listening" },
            { name: "Regarde", value: "watching" },
            { name: "Participe à", value: "competing" },
          ),
      ),
  );

async function execute(interaction, { client }) {
  if (interaction.options.getSubcommand() === "status") {
    const uptime = Math.floor(client.uptime / 1000);
    return respond(interaction, {
      embeds: [createEmbed("État du bot", `Connecté : **oui**\nLatence : **${client.ws.ping} ms**\nServeurs : **${client.guilds.cache.size}**\nEn ligne depuis : <t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`)],
      ephemeral: true,
    });
  }

  if (!process.env.BOT_OWNER_ID || interaction.user.id !== process.env.BOT_OWNER_ID) {
    return respond(interaction, { content: "Seul le propriétaire configuré dans BOT_OWNER_ID peut changer la présence globale.", ephemeral: true });
  }
  const text = interaction.options.getString("texte", true);
  const activity = interaction.options.getString("type", true);
  client.user.setPresence({
    status: "online",
    activities: [{ name: text, type: activities[activity] }],
  });
  return respond(interaction, { embeds: [createEmbed("Présence modifiée", `Le bot ${activity} **${text}**.`)], ephemeral: true });
}

export default { data, execute };

import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Configure les fonctions du bot")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((command) =>
    command
      .setName("welcome")
      .setDescription("Configure les messages de bienvenue")
      .addChannelOption((option) =>
        option
          .setName("salon")
          .setDescription("Salon où envoyer le message")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Variables disponibles : {user}, {server}, {memberCount}")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("goodbye")
      .setDescription("Configure les messages de départ")
      .addChannelOption((option) =>
        option
          .setName("salon")
          .setDescription("Salon où envoyer le message")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Variables disponibles : {user}, {server}, {memberCount}")
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("logs")
      .setDescription("Définit le salon des alertes de modération")
      .addChannelOption((option) =>
        option
          .setName("salon")
          .setDescription("Salon de logs")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("eventlogs")
      .setDescription("Active ou désactive les journaux d'événements")
      .addBooleanOption((option) =>
        option.setName("active").setDescription("Journaliser les suppressions, modifications et changements de rôles").setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("vip")
      .setDescription("Configure le rôle VIP et son salon d'annonces")
      .addRoleOption((option) => option.setName("role").setDescription("Rôle VIP").setRequired(true))
      .addChannelOption((option) =>
        option
          .setName("salon")
          .setDescription("Salon où les membres VIP peuvent publier")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("antiraid")
      .setDescription("Active ou configure la protection contre les arrivées groupées")
      .addBooleanOption((option) =>
        option.setName("active").setDescription("Activer l'anti-raid").setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("seuil")
          .setDescription("Nombre d'arrivées qui déclenche la protection")
          .setMinValue(3)
          .setMaxValue(20),
      )
      .addIntegerOption((option) =>
        option
          .setName("fenetre")
          .setDescription("Fenêtre de détection, en secondes")
          .setMinValue(5)
          .setMaxValue(60),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("levels")
      .setDescription("Active ou désactive l'attribution d'XP")
      .addBooleanOption((option) =>
        option.setName("active").setDescription("Activer les niveaux").setRequired(true),
      ),
  )
  .addSubcommand((command) =>
    command.setName("view").setDescription("Affiche la configuration actuelle"),
  );

function replaceMentions(text) {
  return text.replace(/@everyone|@here/g, (mention) => `@\u200b${mention.slice(1)}`);
}

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }

  const subcommand = interaction.options.getSubcommand();
  const current = store.getGuildSettings(interaction.guildId);

  if (subcommand === "welcome" || subcommand === "goodbye") {
    const isWelcome = subcommand === "welcome";
    const channel = interaction.options.getChannel("salon", true);
    const message = interaction.options.getString("message");
    const updated = await store.updateGuildSettings(interaction.guildId, {
      [isWelcome ? "welcomeChannelId" : "goodbyeChannelId"]: channel.id,
      ...(message ? { [isWelcome ? "welcomeMessage" : "goodbyeMessage"]: replaceMentions(message) } : {}),
    });
    const savedMessage = isWelcome ? updated.welcomeMessage : updated.goodbyeMessage;
    return respond(interaction, {
      embeds: [createEmbed("Configuration enregistrée", `${isWelcome ? "Bienvenue" : "Départ"} : ${channel}\n\n> ${savedMessage}`)],
      ephemeral: true,
    });
  }

  if (subcommand === "logs") {
    const channel = interaction.options.getChannel("salon", true);
    await store.updateGuildSettings(interaction.guildId, { logChannelId: channel.id });
    return respond(interaction, {
      embeds: [createEmbed("Salon de logs configuré", `Les alertes du bot seront envoyées dans ${channel}.`)],
      ephemeral: true,
    });
  }

  if (subcommand === "eventlogs") {
    const enabled = interaction.options.getBoolean("active", true);
    await store.updateGuildSettings(interaction.guildId, { eventLogsEnabled: enabled });
    return respond(interaction, {
      embeds: [createEmbed("Journaux d'événements", `Les journaux détaillés sont maintenant ${enabled ? "activés" : "désactivés"}.`)],
      ephemeral: true,
    });
  }

  if (subcommand === "vip") {
    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("salon", true);
    await store.updateGuildSettings(interaction.guildId, {
      vipRoleId: role.id,
      vipChannelId: channel.id,
    });
    return respond(interaction, {
      embeds: [createEmbed("Espace VIP configuré", `Rôle : ${role}\nSalon d'annonces : ${channel}\nLes membres ayant ce rôle peuvent utiliser \`/vip annonce\`.`)],
      ephemeral: true,
    });
  }

  if (subcommand === "antiraid") {
    const enabled = interaction.options.getBoolean("active", true);
    const threshold = interaction.options.getInteger("seuil") ?? current.antiRaidThreshold;
    const windowSeconds = interaction.options.getInteger("fenetre") ?? current.antiRaidWindowSeconds;
    await store.updateGuildSettings(interaction.guildId, {
      antiRaidEnabled: enabled,
      antiRaidThreshold: threshold,
      antiRaidWindowSeconds: windowSeconds,
    });
    return respond(interaction, {
      embeds: [
        createEmbed(
          enabled ? "Anti-raid activé" : "Anti-raid désactivé",
          enabled
            ? `À partir de ${threshold} arrivées en ${windowSeconds} secondes, les nouveaux arrivants au-delà du seuil recevront un timeout de 10 minutes.`
            : "La détection des arrivées groupées est désactivée.",
        ),
      ],
      ephemeral: true,
    });
  }

  if (subcommand === "levels") {
    const enabled = interaction.options.getBoolean("active", true);
    await store.updateGuildSettings(interaction.guildId, { levelsEnabled: enabled });
    return respond(interaction, {
      embeds: [createEmbed("Niveaux mis à jour", `Attribution d'XP : **${enabled ? "activée" : "désactivée"}**.`)],
      ephemeral: true,
    });
  }

  return respond(interaction, {
    embeds: [
      createEmbed(
        "Configuration du serveur",
        [
          `Bienvenue : ${current.welcomeChannelId ? `<#${current.welcomeChannelId}>` : "non configuré"}`,
          `Départ : ${current.goodbyeChannelId ? `<#${current.goodbyeChannelId}>` : "non configuré"}`,
          `Logs : ${current.logChannelId ? `<#${current.logChannelId}>` : "non configuré"}`,
          `Journaux détaillés : ${current.eventLogsEnabled ? "actifs" : "inactifs"}`,
          `Anti-raid : ${current.antiRaidEnabled ? `actif (${current.antiRaidThreshold} arrivées / ${current.antiRaidWindowSeconds}s)` : "inactif"}`,
          `Auto-modération : ${current.automodEnabled ? "active" : "inactive"}`,
          `Niveaux : ${current.levelsEnabled ? "actifs" : "inactifs"}`,
          `Rôle VIP : ${current.vipRoleId ? `<@&${current.vipRoleId}>` : "non configuré"}`,
          `Salon VIP : ${current.vipChannelId ? `<#${current.vipChannelId}>` : "non configuré"}`,
        ].join("\n"),
      ),
    ],
    ephemeral: true,
  });
}

export default { data, execute };

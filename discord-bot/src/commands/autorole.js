import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = new SlashCommandBuilder()
  .setName("autorole")
  .setDescription("Configure un rôle attribué automatiquement aux nouveaux membres")
  .addSubcommand((command) =>
    command
      .setName("set")
      .setDescription("Choisit le rôle à donner aux nouveaux membres")
      .addRoleOption((option) => option.setName("role").setDescription("Rôle automatique").setRequired(true)),
  )
  .addSubcommand((command) => command.setName("disable").setDescription("Désactive l'attribution automatique"))
  .addSubcommand((command) => command.setName("status").setDescription("Affiche le rôle automatique actuel"));

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  const settings = store.getGuildSettings(interaction.guildId);
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
    const role = settings.autoRoleId ? interaction.guild.roles.cache.get(settings.autoRoleId) : null;
    return respond(interaction, {
      embeds: [createEmbed("Rôle automatique", role ? `Les nouveaux membres reçoivent ${role}.` : "Aucun rôle automatique n'est configuré.")],
      ephemeral: true,
    });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return respond(interaction, { content: "Tu dois gérer le serveur pour modifier le rôle automatique.", ephemeral: true });
  }
  if (subcommand === "disable") {
    await store.updateGuildSettings(interaction.guildId, { autoRoleId: null });
    return respond(interaction, { embeds: [createEmbed("Rôle automatique désactivé", "Les prochains membres ne recevront plus de rôle automatiquement.")], ephemeral: true });
  }

  const role = interaction.options.getRole("role", true);
  const botMember = interaction.guild.members.me;
  if (role.id === interaction.guild.id || role.managed || !botMember || role.position >= botMember.roles.highest.position) {
    return respond(interaction, { content: "Choisis un rôle non géré placé sous le rôle le plus élevé du bot.", ephemeral: true });
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return respond(interaction, { content: "Le bot a besoin de la permission Gérer les rôles pour attribuer ce rôle.", ephemeral: true });
  }
  await store.updateGuildSettings(interaction.guildId, { autoRoleId: role.id });
  return respond(interaction, { embeds: [createEmbed("Rôle automatique configuré", `Les nouveaux membres recevront ${role}. Le bot ne l'attribuera pas aux arrivants détectés pendant un raid.`)], ephemeral: true });
}

export default { data, execute };

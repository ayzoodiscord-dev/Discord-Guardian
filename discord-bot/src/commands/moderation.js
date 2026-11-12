import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const reasonOption = (option) =>
  option.setName("raison").setDescription("Motif de l'action").setMaxLength(500);

const commands = [
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulse un membre du serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre à expulser").setRequired(true))
    .addStringOption((option) => reasonOption(option).setRequired(false)),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannit un membre du serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre à bannir").setRequired(true))
    .addStringOption((option) => reasonOption(option).setRequired(false)),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Applique un timeout à un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre à modérer").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("minutes").setDescription("Durée du timeout").setMinValue(1).setMaxValue(40320).setRequired(true),
    )
    .addStringOption((option) => reasonOption(option).setRequired(false)),
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Retire le timeout d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre à rétablir").setRequired(true)),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Ajoute un avertissement à un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre averti").setRequired(true))
    .addStringOption((option) => option.setName("raison").setDescription("Motif").setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Affiche les avertissements d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Membre concerné").setRequired(true)),
  new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Supprime un avertissement par son identifiant")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption((option) => option.setName("id").setDescription("Identifiant affiché dans /warnings").setRequired(true)),
  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Supprime des messages récents")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName("nombre").setDescription("Nombre de messages (1 à 100)").setMinValue(1).setMaxValue(100).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Règle le délai entre les messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) =>
      option.setName("secondes").setDescription("0 pour désactiver (maximum 6 heures)").setMinValue(0).setMaxValue(21600).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Empêche les membres d'écrire dans ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Autorise les membres à écrire dans ce salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map((data) => data.toJSON());

function hasPermission(interaction, permission) {
  if (interaction.memberPermissions?.has(permission)) return true;
  void respond(interaction, { content: "Tu n'as pas la permission requise pour cette commande.", ephemeral: true });
  return false;
}

async function getTarget(interaction) {
  const user = interaction.options.getUser("membre", true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await respond(interaction, { content: "Ce membre n'est plus sur le serveur.", ephemeral: true });
    return null;
  }
  if (user.id === interaction.user.id || user.id === interaction.guild.ownerId) {
    await respond(interaction, { content: "Cette action ne peut pas viser cette personne.", ephemeral: true });
    return null;
  }
  if (!member.manageable) {
    await respond(interaction, { content: "Le rôle du bot est trop bas pour agir sur ce membre.", ephemeral: true });
    return null;
  }
  return member;
}

async function logAction(interaction, store, description) {
  const channelId = store.getGuildSettings(interaction.guildId).logChannelId;
  if (!channelId) return;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [createEmbed("Action de modération", description)] }).catch(() => {});
}

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }

  const command = interaction.commandName;
  const permissionByCommand = {
    kick: PermissionFlagsBits.KickMembers,
    ban: PermissionFlagsBits.BanMembers,
    timeout: PermissionFlagsBits.ModerateMembers,
    untimeout: PermissionFlagsBits.ModerateMembers,
    warn: PermissionFlagsBits.ModerateMembers,
    warnings: PermissionFlagsBits.ModerateMembers,
    unwarn: PermissionFlagsBits.ModerateMembers,
    purge: PermissionFlagsBits.ManageMessages,
    slowmode: PermissionFlagsBits.ManageChannels,
    lock: PermissionFlagsBits.ManageChannels,
    unlock: PermissionFlagsBits.ManageChannels,
  };
  if (!hasPermission(interaction, permissionByCommand[command])) return;

  if (command === "kick" || command === "ban" || command === "timeout" || command === "untimeout") {
    const member = await getTarget(interaction);
    if (!member) return;
    const reason = interaction.options.getString("raison") || `Action par ${interaction.user.tag}`;

    if (command === "kick") await member.kick(reason);
    if (command === "ban") await member.ban({ reason, deleteMessageSeconds: 0 });
    if (command === "timeout") {
      const minutes = interaction.options.getInteger("minutes", true);
      await member.timeout(minutes * 60_000, reason);
      await logAction(interaction, store, `${member.user.tag} a reçu un timeout de ${minutes} minute(s).\nMotif : ${reason}`);
      return respond(interaction, { embeds: [createEmbed("Timeout appliqué", `${member.user.tag} est en timeout pour ${minutes} minute(s).`)], ephemeral: true });
    }
    if (command === "untimeout") await member.timeout(null, `Timeout retiré par ${interaction.user.tag}`);

    const verb = command === "kick" ? "expulsé" : command === "ban" ? "banni" : "réactivé";
    await logAction(interaction, store, `${member.user.tag} a été ${verb} par ${interaction.user.tag}.\nMotif : ${reason}`);
    return respond(interaction, { embeds: [createEmbed("Modération effectuée", `${member.user.tag} a été ${verb}.`)], ephemeral: true });
  }

  if (command === "warn") {
    const user = interaction.options.getUser("membre", true);
    const reason = interaction.options.getString("raison", true);
    const warning = await store.addWarning(interaction.guildId, user.id, interaction.user.id, reason);
    await logAction(interaction, store, `Avertissement **${warning.id}** pour ${user.tag}, ajouté par ${interaction.user.tag}.\nMotif : ${reason}`);
    return respond(interaction, { embeds: [createEmbed("Avertissement ajouté", `${user.tag} a reçu un avertissement.\nIdentifiant : \`${warning.id}\`\nMotif : ${reason}`)], ephemeral: true });
  }

  if (command === "warnings") {
    const user = interaction.options.getUser("membre", true);
    const warnings = store.getWarnings(interaction.guildId, user.id);
    const description = warnings.length
      ? warnings.slice(0, 10).map((warning) => `\`${warning.id}\` — ${warning.reason} · <@${warning.moderatorId}>`).join("\n")
      : "Aucun avertissement enregistré.";
    return respond(interaction, { embeds: [createEmbed(`Avertissements de ${user.tag}`, description)], ephemeral: true });
  }

  if (command === "unwarn") {
    const id = interaction.options.getString("id", true);
    const removed = await store.removeWarning(interaction.guildId, id);
    return respond(interaction, {
      embeds: [createEmbed(removed ? "Avertissement supprimé" : "Avertissement introuvable", removed ? `L'avertissement \`${id}\` a été supprimé.` : "Vérifie l'identifiant et le serveur.")],
      ephemeral: true,
    });
  }

  if (command === "purge") {
    const count = interaction.options.getInteger("nombre", true);
    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased() || !("bulkDelete" in channel)) {
      return respond(interaction, { content: "Cette commande doit être utilisée dans un salon textuel.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const deleted = await channel.bulkDelete(count, true);
    await logAction(interaction, store, `${deleted.size} message(s) supprimé(s) dans ${channel} par ${interaction.user.tag}.`);
    return interaction.editReply({ embeds: [createEmbed("Messages supprimés", `${deleted.size} message(s) récent(s) supprimé(s). Discord ne permet pas de supprimer en lot les messages de plus de 14 jours.`)] });
  }

  if (command === "slowmode") {
    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased() || !("setRateLimitPerUser" in channel)) {
      return respond(interaction, { content: "Cette commande doit être utilisée dans un salon textuel.", ephemeral: true });
    }
    const seconds = interaction.options.getInteger("secondes", true);
    await channel.setRateLimitPerUser(seconds, `Réglé par ${interaction.user.tag}`);
    return respond(interaction, { embeds: [createEmbed("Mode lent mis à jour", seconds ? `Un message toutes les ${seconds} seconde(s).` : "Le mode lent est désactivé.")], ephemeral: true });
  }

  if (command === "lock" || command === "unlock") {
    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased()) {
      return respond(interaction, { content: "Cette commande doit être utilisée dans un salon textuel.", ephemeral: true });
    }
    const locked = command === "lock";
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: locked ? false : null,
    }, { reason: `${locked ? "Verrouillé" : "Déverrouillé"} par ${interaction.user.tag}` });
    return respond(interaction, { embeds: [createEmbed(locked ? "Salon verrouillé" : "Salon déverrouillé", `${channel} est ${locked ? "verrouillé" : "déverrouillé"}.`)], ephemeral: true });
  }
}

export default { data: commands, execute };

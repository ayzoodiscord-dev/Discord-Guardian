import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Ouvre et gère les tickets privés du serveur")
  .addSubcommand((command) =>
    command
      .setName("config")
      .setDescription("Configure le rôle du support et la catégorie des tickets")
      .addRoleOption((option) => option.setName("role").setDescription("Rôle de l'équipe support").setRequired(true))
      .addChannelOption((option) =>
        option
          .setName("categorie")
          .setDescription("Catégorie où créer les tickets")
          .addChannelTypes(ChannelType.GuildCategory),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("create")
      .setDescription("Ouvre un ticket privé")
      .addStringOption((option) => option.setName("sujet").setDescription("Motif de ta demande").setMaxLength(150).setRequired(true)),
  )
  .addSubcommand((command) =>
    command
      .setName("close")
      .setDescription("Ferme le ticket dans lequel tu te trouves")
      .addStringOption((option) => option.setName("raison").setDescription("Raison de fermeture").setMaxLength(300)),
  )
  .addSubcommand((command) => command.setName("reopen").setDescription("Rouvre un ticket fermé dans lequel tu te trouves"))
  .addSubcommand((command) => command.setName("list").setDescription("Affiche les tickets récents du serveur"));

function closeButton(ticketId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel("Fermer le ticket")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function hasManagePermission(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
}

async function isSupportMember(interaction, settings) {
  if (hasManagePermission(interaction)) return true;
  if (!settings.ticketStaffRoleId) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return Boolean(member?.roles.cache.has(settings.ticketStaffRoleId));
}

async function closeTicket(interaction, store, reason = "Fermé depuis Discord") {
  const ticket = store.getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) {
    await respond(interaction, { content: "Ce salon n'est pas un ticket géré par le bot.", ephemeral: true });
    return null;
  }
  if (ticket.status === "closed") {
    await respond(interaction, { content: "Ce ticket est déjà fermé.", ephemeral: true });
    return null;
  }

  const settings = store.getGuildSettings(interaction.guildId);
  const isCreator = ticket.userId === interaction.user.id;
  if (!isCreator && !(await isSupportMember(interaction, settings))) {
    await respond(interaction, { content: "Seul le créateur du ticket ou l'équipe support peut le fermer.", ephemeral: true });
    return null;
  }

  await interaction.channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
    AttachFiles: false,
    AddReactions: false,
  });
  const updated = await store.updateTicket(interaction.guildId, ticket.id, {
    status: "closed",
    closedAt: Date.now(),
    closedBy: interaction.user.id,
  });
  await interaction.channel.setName(`ferme-${ticket.id.slice(0, 8)}`).catch(() => {});
  await interaction.channel.send({
    embeds: [createEmbed("Ticket fermé", `Fermé par ${interaction.user.tag}.\nRaison : ${reason}\nUn membre du support peut le rouvrir avec \`/ticket reopen\`.`)],
    components: [closeButton(ticket.id, true)],
    allowedMentions: { parse: [] },
  });
  return updated;
}

async function reopenTicket(interaction, store) {
  const ticket = store.getTicketByChannel(interaction.guildId, interaction.channelId);
  if (!ticket) {
    return respond(interaction, { content: "Ce salon n'est pas un ticket géré par le bot.", ephemeral: true });
  }
  if (ticket.status === "open") {
    return respond(interaction, { content: "Ce ticket est déjà ouvert.", ephemeral: true });
  }
  const settings = store.getGuildSettings(interaction.guildId);
  const isCreator = ticket.userId === interaction.user.id;
  if (!isCreator && !(await isSupportMember(interaction, settings))) {
    return respond(interaction, { content: "Seul le créateur du ticket ou l'équipe support peut le rouvrir.", ephemeral: true });
  }

  await interaction.channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: true,
    AttachFiles: true,
    AddReactions: true,
  });
  await store.updateTicket(interaction.guildId, ticket.id, { status: "open", closedAt: null, closedBy: null });
  await interaction.channel.setName(`ticket-${ticket.id.slice(0, 8)}`).catch(() => {});
  await interaction.channel.send({
    embeds: [createEmbed("Ticket rouvert", `Le ticket de <@${ticket.userId}> est de nouveau ouvert.`)],
    allowedMentions: { users: [ticket.userId] },
  });
  return respond(interaction, { embeds: [createEmbed("Ticket rouvert", `Le ticket \`${ticket.id}\` est de nouveau ouvert.`)], ephemeral: true });
}

async function execute(interaction, { client, store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  const subcommand = interaction.options.getSubcommand();
  const settings = store.getGuildSettings(interaction.guildId);

  if (subcommand === "config") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return respond(interaction, { content: "Tu dois gérer le serveur pour configurer les tickets.", ephemeral: true });
    }
    const role = interaction.options.getRole("role", true);
    const category = interaction.options.getChannel("categorie");
    await store.updateGuildSettings(interaction.guildId, {
      ticketStaffRoleId: role.id,
      ...(category ? { ticketCategoryId: category.id } : {}),
    });
    return respond(interaction, {
      embeds: [createEmbed("Tickets configurés", `Rôle support : ${role}\nCatégorie : ${category ? category.name : settings.ticketCategoryId ? `<#${settings.ticketCategoryId}>` : "salon actuel"}\nLes membres peuvent ouvrir un ticket avec \`/ticket create\`.`)],
      ephemeral: true,
    });
  }

  if (subcommand === "list") {
    if (!(await isSupportMember(interaction, settings))) {
      return respond(interaction, { content: "Cette liste est réservée à l'équipe support.", ephemeral: true });
    }
    const tickets = store.getTicketsForGuild(interaction.guildId, 15);
    const description = tickets.length
      ? tickets.map((ticket) => `${ticket.status === "open" ? "Ouvert" : "Fermé"} · <#${ticket.channelId}> · <@${ticket.userId}> · ${ticket.subject.slice(0, 80)}`).join("\n")
      : "Aucun ticket enregistré.";
    return respond(interaction, { embeds: [createEmbed("Tickets récents", description)], ephemeral: true });
  }

  if (subcommand === "create") {
    if (!settings.ticketStaffRoleId) {
      return respond(interaction, { content: "Le système de tickets n'est pas configuré. Un administrateur doit utiliser `/ticket config`.", ephemeral: true });
    }
    if (store.getOpenTicketForUser(interaction.guildId, interaction.user.id)) {
      return respond(interaction, { content: "Tu as déjà un ticket ouvert sur ce serveur.", ephemeral: true });
    }
    const staffRole = interaction.guild.roles.cache.get(settings.ticketStaffRoleId);
    if (!staffRole) {
      return respond(interaction, { content: "Le rôle support configuré n'existe plus. Demande à un administrateur de refaire `/ticket config`.", ephemeral: true });
    }
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return respond(interaction, { content: "Le bot a besoin de la permission Gérer les salons pour ouvrir des tickets.", ephemeral: true });
    }
    if (staffRole.position >= botMember.roles.highest.position) {
      return respond(interaction, { content: "Place le rôle du bot au-dessus du rôle support pour qu'il puisse créer les permissions des tickets.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const id = randomUUID().replaceAll("-", "").slice(0, 12);
    const subject = interaction.options.getString("sujet", true);
    const safeUsername = interaction.user.username
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 20) || "membre";
    const permissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];

    let channel;
    try {
      channel = await interaction.guild.channels.create({
        name: `ticket-${safeUsername}-${id.slice(0, 4)}`,
        type: ChannelType.GuildText,
        parent: settings.ticketCategoryId ?? undefined,
        topic: `Ticket ${id} — ${subject.slice(0, 80)}`,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: permissions },
          { id: staffRole.id, allow: permissions },
          { id: client.user.id, allow: [...permissions, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
        ],
      });
      const ticket = await store.createTicket({
        id,
        guildId: interaction.guildId,
        channelId: channel.id,
        userId: interaction.user.id,
        subject,
      });
      await channel.send({
        content: `${interaction.user} ${staffRole}`,
        embeds: [createEmbed(`Ticket de ${interaction.user.username}`, `**Sujet :** ${subject}\n**Identifiant :** \`${ticket.id}\`\nUn membre du support répondra ici. Tu peux fermer ce ticket quand ta demande est terminée.`)],
        components: [closeButton(ticket.id)],
        allowedMentions: { users: [interaction.user.id], roles: [staffRole.id] },
      });
      return interaction.editReply({ content: `Ton ticket est ouvert : ${channel}` });
    } catch (error) {
      if (channel) await store.deleteTicket(interaction.guildId, id).catch(() => {});
      if (channel) await channel.delete("Échec de la création du ticket").catch(() => {});
      throw error;
    }
  }

  if (subcommand === "close") {
    const reason = interaction.options.getString("raison") ?? "Aucune raison indiquée";
    const ticket = await closeTicket(interaction, store, reason);
    if (ticket) {
      return respond(interaction, { embeds: [createEmbed("Ticket fermé", `Le ticket \`${ticket.id}\` est maintenant fermé.`)], ephemeral: true });
    }
    return;
  }

  return reopenTicket(interaction, store);
}

async function handleButton(interaction, { store }) {
  const match = interaction.customId.match(/^ticket:close:([a-f0-9]+)$/);
  if (!match) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Cette action doit être faite sur le serveur du ticket.", ephemeral: true });
    return true;
  }
  const ticket = store.getTicket(interaction.guildId, match[1]);
  if (!ticket || ticket.channelId !== interaction.channelId) {
    await interaction.reply({ content: "Ticket introuvable.", ephemeral: true });
    return true;
  }
  const settings = store.getGuildSettings(interaction.guildId);
  const isCreator = ticket.userId === interaction.user.id;
  if (!isCreator && !(await isSupportMember(interaction, settings))) {
    await interaction.reply({ content: "Seul le créateur du ticket ou l'équipe support peut le fermer.", ephemeral: true });
    return true;
  }
  const updated = await closeTicket(interaction, store);
  if (updated) {
    await interaction.update({ embeds: [createEmbed("Ticket fermé", `Le ticket \`${updated.id}\` est fermé. L'équipe support peut le rouvrir avec \`/ticket reopen\`.`)], components: [] });
  }
  return true;
}

export default { data, execute, handleButton };

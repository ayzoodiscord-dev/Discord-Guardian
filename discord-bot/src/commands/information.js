import {
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = [
  new SlashCommandBuilder().setName("help").setDescription("Affiche les commandes du bot"),
  new SlashCommandBuilder().setName("ping").setDescription("Vérifie la latence du bot"),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Affiche les informations du serveur"),
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Affiche les informations d'un membre")
    .addUserOption((option) => option.setName("membre").setDescription("Membre à consulter").setRequired(false)),
  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Affiche l'avatar d'un membre")
    .addUserOption((option) => option.setName("membre").setDescription("Membre à consulter").setRequired(false)),
  new SlashCommandBuilder().setName("botinfo").setDescription("Affiche les informations du bot"),
  new SlashCommandBuilder().setName("invite").setDescription("Affiche le lien d'invitation du bot"),
  new SlashCommandBuilder()
    .setName("sondage")
    .setDescription("Crée un sondage avec deux à quatre propositions")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) => option.setName("question").setDescription("Question du sondage").setMaxLength(250).setRequired(true))
    .addStringOption((option) => option.setName("option1").setDescription("Première proposition").setMaxLength(100).setRequired(true))
    .addStringOption((option) => option.setName("option2").setDescription("Deuxième proposition").setMaxLength(100).setRequired(true))
    .addStringOption((option) => option.setName("option3").setDescription("Troisième proposition").setMaxLength(100).setRequired(false))
    .addStringOption((option) => option.setName("option4").setDescription("Quatrième proposition").setMaxLength(100).setRequired(false)),
].map((command) => command.toJSON());

const pollMarkers = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

async function execute(interaction, { client }) {
  const command = interaction.commandName;

  if (command === "help") {
    const embed = createEmbed("Commandes disponibles", "Utilise les commandes slash en commençant par `/`.")
      .addFields(
        { name: "Configuration", value: "`/config` — messages, logs, anti-raid et niveaux", inline: false },
        { name: "Modération", value: "`/kick` `/ban` `/timeout` `/untimeout` `/warn` `/warnings` `/unwarn` `/purge` `/slowmode` `/lock` `/unlock`", inline: false },
        { name: "Niveaux", value: "`/profil` `/classement` — XP automatique sur les messages", inline: false },
        { name: "Informations et outils", value: "`/ping` `/serverinfo` `/userinfo` `/avatar` `/botinfo` `/invite` `/sondage`", inline: false },
        { name: "Jeux", value: "`/pileouface` `/de` `/8ball` `/shifumi`", inline: false },
      );
    return respond(interaction, { embeds: [embed], ephemeral: true });
  }

  if (command === "ping") {
    return respond(interaction, {
      embeds: [createEmbed("Latence", `Passerelle : **${client.ws.ping} ms**\nRéponse : **${Date.now() - interaction.createdTimestamp} ms**`)],
    });
  }

  if (command === "serverinfo") {
    if (!interaction.inGuild()) return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    const embed = createEmbed(guild.name, "Informations du serveur")
      .addFields(
        { name: "Membres", value: `${guild.memberCount}`, inline: true },
        { name: "Salons", value: `${guild.channels.cache.size}`, inline: true },
        { name: "Créé le", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "Propriétaire", value: owner.user.tag, inline: true },
        { name: "Identifiant", value: guild.id, inline: true },
      );
    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
    return respond(interaction, { embeds: [embed] });
  }

  if (command === "userinfo") {
    if (!interaction.inGuild()) return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const embed = createEmbed(user.tag, "Informations du membre")
      .addFields(
        { name: "Compte créé", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "A rejoint le serveur", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>` : "Inconnu", inline: true },
        { name: "Identifiant", value: user.id, inline: true },
      );
    embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    return respond(interaction, { embeds: [embed] });
  }

  if (command === "avatar") {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const embed = createEmbed(`Avatar de ${user.tag}`, `[Ouvrir l'image](${url})`).setImage(url);
    return respond(interaction, { embeds: [embed] });
  }

  if (command === "botinfo") {
    const uptimeSeconds = Math.floor(client.uptime / 1000);
    const embed = createEmbed("Informations du bot", "Bot Discord de modération, de niveaux et d'utilitaires.")
      .addFields(
        { name: "Serveurs", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Utilisateurs visibles", value: `${client.guilds.cache.reduce((sum, guild) => sum + guild.memberCount, 0)}`, inline: true },
        { name: "En ligne depuis", value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true },
      );
    return respond(interaction, { embeds: [embed] });
  }

  if (command === "invite") {
    const permissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageChannels,
    ];
    const query = new URLSearchParams({
      client_id: client.user.id,
      scope: "bot applications.commands",
      permissions: String(permissions.reduce((bits, value) => bits | value, 0n)),
    });
    const url = `https://discord.com/oauth2/authorize?${query.toString()}`;
    return respond(interaction, { embeds: [createEmbed("Inviter le bot", `[Ouvrir le lien d'invitation](${url})`)], ephemeral: true });
  }

  if (command === "sondage") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return respond(interaction, { content: "Tu dois pouvoir gérer les messages pour créer un sondage.", ephemeral: true });
    }
    const question = interaction.options.getString("question", true);
    const choices = [1, 2, 3, 4]
      .map((index) => interaction.options.getString(`option${index}`))
      .filter(Boolean);
    const embed = createEmbed(question, choices.map((choice, index) => `${pollMarkers[index]}  ${choice}`).join("\n\n"))
      .setFooter({ text: `Sondage proposé par ${interaction.user.tag}` });
    await interaction.reply({ embeds: [embed] });
    const message = await interaction.fetchReply();
    await Promise.all(pollMarkers.slice(0, choices.length).map((marker) => message.react(marker)));
    return;
  }
}

export default { data, execute };

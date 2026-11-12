import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const pendingRestores = new Map();

const data = new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Exporte ou restaure les données du bot pour ce serveur")
  .addSubcommand((command) => command.setName("export").setDescription("Télécharge une sauvegarde du serveur"))
  .addSubcommand((command) =>
    command
      .setName("restore")
      .setDescription("Prépare la restauration d'une sauvegarde de ce serveur")
      .addAttachmentOption((option) => option.setName("fichier").setDescription("Fichier JSON exporté par le bot").setRequired(true)),
  );

function isManager(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function execute(interaction, { store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  if (!isManager(interaction)) {
    return respond(interaction, { content: "Tu dois gérer le serveur pour créer ou restaurer une sauvegarde.", ephemeral: true });
  }

  if (interaction.options.getSubcommand() === "export") {
    const backup = store.exportGuildBackup(interaction.guildId);
    const buffer = Buffer.from(JSON.stringify(backup, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    return interaction.reply({
      embeds: [createEmbed("Sauvegarde prête", "Ce fichier contient les réglages, les niveaux, les avertissements et les giveaways enregistrés par le bot. Garde-le dans un emplacement sûr.")],
      files: [{ attachment: buffer, name: `sauvegarde-${interaction.guildId}-${date}.json` }],
      ephemeral: true,
    });
  }

  const attachment = interaction.options.getAttachment("fichier", true);
  if (attachment.size > 8_000_000) {
    return respond(interaction, { content: "Le fichier doit faire moins de 8 Mo.", ephemeral: true });
  }
  if (!attachment.name.toLowerCase().endsWith(".json")) {
    return respond(interaction, { content: "Choisis un fichier JSON exporté par ce bot.", ephemeral: true });
  }

  let backup;
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error("Téléchargement refusé");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 8_000_000) throw new Error("Fichier trop volumineux");
    backup = JSON.parse(text);
    if (backup?.format !== "discord-bot-server-backup" || backup?.version !== 1 || backup.guildId !== interaction.guildId) {
      throw new Error("La sauvegarde ne correspond pas à ce serveur.");
    }
  } catch (error) {
    return respond(interaction, { content: `Fichier de sauvegarde invalide : ${error.message}`, ephemeral: true });
  }

  const token = randomUUID().replaceAll("-", "").slice(0, 16);
  const timeout = setTimeout(() => pendingRestores.delete(token), 120_000);
  timeout.unref?.();
  pendingRestores.set(token, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    backup,
    timeout,
  });
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`backup:confirm:${token}`).setLabel("Confirmer la restauration").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`backup:cancel:${token}`).setLabel("Annuler").setStyle(ButtonStyle.Secondary),
  );
  return interaction.reply({
    embeds: [
      createEmbed(
        "Confirmer la restauration",
        "Cette action remplacera, pour ce serveur uniquement, les réglages du bot, les profils de niveaux, les avertissements et les giveaways présents par ceux du fichier. Cette action ne modifie pas les salons, rôles ou autres réglages Discord.",
      ),
    ],
    components: [controls],
    ephemeral: true,
  });
}

async function handleButton(interaction, { store }) {
  const match = interaction.customId.match(/^backup:(confirm|cancel):([a-f0-9]+)$/);
  if (!match) return false;
  const [, action, token] = match;
  const pending = pendingRestores.get(token);
  if (!pending || pending.guildId !== interaction.guildId) {
    await interaction.update({ content: "Cette confirmation a expiré.", embeds: [], components: [] });
    return true;
  }
  if (pending.userId !== interaction.user.id) {
    await interaction.reply({ content: "Seule la personne qui a préparé cette restauration peut confirmer.", ephemeral: true });
    return true;
  }

  clearTimeout(pending.timeout);
  pendingRestores.delete(token);
  if (action === "cancel") {
    await interaction.update({ embeds: [createEmbed("Restauration annulée", "Aucune donnée n'a été modifiée.")], components: [] });
    return true;
  }

  try {
    await store.restoreGuildBackup(pending.guildId, pending.backup);
    await interaction.update({ embeds: [createEmbed("Sauvegarde restaurée", "Les données du bot de ce serveur ont été remplacées par celles de la sauvegarde.")], components: [] });
  } catch (error) {
    await interaction.update({ embeds: [createEmbed("Restauration impossible", error.message)], components: [] });
  }
  return true;
}

export default { data, execute, handleButton };

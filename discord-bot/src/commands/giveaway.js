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
  .setName("giveaway")
  .setDescription("Crée et gère les giveaways du serveur")
  .addSubcommand((command) =>
    command
      .setName("start")
      .setDescription("Lance un giveaway")
      .addStringOption((option) => option.setName("prix").setDescription("Lot à gagner").setMaxLength(200).setRequired(true))
      .addIntegerOption((option) => option.setName("minutes").setDescription("Durée en minutes").setMinValue(1).setMaxValue(10080).setRequired(true))
      .addIntegerOption((option) => option.setName("gagnants").setDescription("Nombre de gagnants").setMinValue(1).setMaxValue(20).setRequired(true))
      .addChannelOption((option) =>
        option
          .setName("salon")
          .setDescription("Salon de publication, par défaut le salon actuel")
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((command) =>
    command
      .setName("end")
      .setDescription("Termine un giveaway avant la date prévue")
      .addStringOption((option) => option.setName("id").setDescription("Identifiant du giveaway").setRequired(true)),
  )
  .addSubcommand((command) =>
    command
      .setName("reroll")
      .setDescription("Tire un autre gagnant après la fin")
      .addStringOption((option) => option.setName("id").setDescription("Identifiant du giveaway").setRequired(true)),
  )
  .addSubcommand((command) => command.setName("list").setDescription("Affiche les giveaways en cours"));

const activeTimers = new Map();

function entryButton(id, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:enter:${id}`)
      .setLabel("Participer")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

function giveawayEmbed(giveaway, ended = false) {
  const endLine = ended
    ? `Terminé <t:${Math.floor((giveaway.endedAt ?? Date.now()) / 1000)}:R>`
    : `Fin <t:${Math.floor(giveaway.endsAt / 1000)}:R>`;
  const winners = ended
    ? giveaway.winners.length
      ? giveaway.winners.map((id) => `<@${id}>`).join(", ")
      : "Aucun participant, aucun gagnant tiré."
    : "Clique sur le bouton pour participer.";
  return createEmbed(ended ? "Giveaway terminé" : `Giveaway : ${giveaway.prize}`, `**Lot :** ${giveaway.prize}\n**Gagnants :** ${giveaway.winnersCount}\n**Participants :** ${giveaway.entries.length}\n**${endLine}**\n\n${ended ? `**Résultat :** ${winners}` : winners}`)
    .setFooter({ text: `ID du giveaway : ${giveaway.id}` });
}

async function publishEndedGiveaway(client, store, guildId, id, { reroll = false } = {}) {
  const giveaway = await store.finishGiveaway(guildId, id, { reroll });
  if (!giveaway) return null;
  const activeTimer = activeTimers.get(id);
  if (activeTimer) clearTimeout(activeTimer);
  activeTimers.delete(id);

  const guild = client.guilds.cache.get(guildId);
  const channel = guild
    ? guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null)
    : null;
  if (!channel?.isTextBased()) return giveaway;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (message) {
    await message.edit({
      embeds: [giveawayEmbed(giveaway, giveaway.ended)],
      components: [entryButton(id, true)],
    }).catch((error) => console.error(`Impossible de mettre à jour le giveaway ${id} :`, error));
  }
  if (giveaway.winners.length) {
    await channel.send({
      content: `${reroll ? "Nouveau tirage" : "Giveaway terminé"} : ${giveaway.winners.map((userId) => `<@${userId}>`).join(", ")} gagne(nt) **${giveaway.prize}**.`,
      allowedMentions: { users: giveaway.winners },
    }).catch((error) => console.error(`Impossible d'annoncer les gagnants du giveaway ${id} :`, error));
  }
  return giveaway;
}

export function scheduleGiveaway(client, store, giveaway) {
  const previousTimer = activeTimers.get(giveaway.id);
  if (previousTimer) clearTimeout(previousTimer);
  const delay = Math.max(0, giveaway.endsAt - Date.now());
  const timer = setTimeout(() => {
    if (Date.now() < giveaway.endsAt) {
      scheduleGiveaway(client, store, giveaway);
      return;
    }
    publishEndedGiveaway(client, store, giveaway.guildId, giveaway.id).catch((error) => {
      console.error(`La fin automatique du giveaway ${giveaway.id} a échoué :`, error);
    });
  }, Math.min(delay, 2_147_000_000));
  timer.unref?.();
  activeTimers.set(giveaway.id, timer);
}

export function scheduleExistingGiveaways(client, store) {
  for (const giveaway of store.getActiveGiveaways()) scheduleGiveaway(client, store, giveaway);
}

async function execute(interaction, { client, store }) {
  if (!interaction.inGuild()) {
    return respond(interaction, { content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
  }
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "list") {
    const giveaways = store.getActiveGiveaways().filter((item) => item.guildId === interaction.guildId);
    const description = giveaways.length
      ? giveaways.map((item) => `**${item.prize}** — <#${item.channelId}> — fin <t:${Math.floor(item.endsAt / 1000)}:R> — ID \`${item.id}\``).join("\n")
      : "Aucun giveaway en cours.";
    return respond(interaction, { embeds: [createEmbed("Giveaways en cours", description)], ephemeral: true });
  }

  if (subcommand === "start") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return respond(interaction, { content: "Tu dois gérer le serveur pour lancer un giveaway.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("salon") ?? interaction.channel;
    if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel)) {
      return respond(interaction, { content: "Choisis un salon textuel accessible au bot.", ephemeral: true });
    }
    const minutes = interaction.options.getInteger("minutes", true);
    const giveaway = await store.createGiveaway({
      guildId: interaction.guildId,
      channelId: channel.id,
      prize: interaction.options.getString("prix", true),
      winnersCount: interaction.options.getInteger("gagnants", true),
      endsAt: Date.now() + minutes * 60_000,
      hostId: interaction.user.id,
    });
    try {
      const message = await channel.send({
        embeds: [giveawayEmbed(giveaway)],
        components: [entryButton(giveaway.id)],
      });
      await store.setGiveawayMessageId(interaction.guildId, giveaway.id, message.id);
      scheduleGiveaway(client, store, giveaway);
      return respond(interaction, {
        embeds: [createEmbed("Giveaway créé", `Publié dans ${channel}.\nIdentifiant : \`${giveaway.id}\``)],
        ephemeral: true,
      });
    } catch (error) {
      await store.deleteGiveaway(interaction.guildId, giveaway.id);
      throw error;
    }
  }

  const id = interaction.options.getString("id", true);
  const giveaway = store.getGiveaway(interaction.guildId, id);
  if (!giveaway) {
    return respond(interaction, { content: "Aucun giveaway correspondant à cet identifiant sur ce serveur.", ephemeral: true });
  }
  const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || giveaway.hostId === interaction.user.id;
  if (!canManage) {
    return respond(interaction, { content: "Seule la personne qui l'a lancé ou un gestionnaire du serveur peut modifier ce giveaway.", ephemeral: true });
  }
  if (subcommand === "end" && giveaway.ended) {
    return respond(interaction, { content: "Ce giveaway est déjà terminé.", ephemeral: true });
  }
  if (subcommand === "reroll" && !giveaway.ended) {
    return respond(interaction, { content: "Termine d'abord le giveaway avant de relancer le tirage.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await publishEndedGiveaway(client, store, interaction.guildId, id, { reroll: subcommand === "reroll" });
  return interaction.editReply({
    embeds: [createEmbed(result ? "Giveaway mis à jour" : "Tirage impossible", result ? (result.winners.length ? `Gagnant(s) : ${result.winners.map((userId) => `<@${userId}>`).join(", ")}` : "Aucun participant éligible.") : "Aucun nouveau participant à tirer.")],
  });
}

async function handleButton(interaction, { store }) {
  const match = interaction.customId.match(/^giveaway:enter:([a-f0-9]+)$/);
  if (!match) return false;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "Cette inscription doit être faite sur le serveur du giveaway.", ephemeral: true });
    return true;
  }
  if (interaction.user.bot) {
    await interaction.reply({ content: "Les bots ne peuvent pas participer.", ephemeral: true });
    return true;
  }
  const result = await store.toggleGiveawayEntry(interaction.guildId, match[1], interaction.user.id);
  await interaction.reply({
    content: result
      ? result.entered ? "Ta participation est enregistrée." : "Ta participation a été retirée."
      : "Ce giveaway est terminé ou introuvable.",
    ephemeral: true,
  });
  return true;
}

export default { data, execute, handleButton };

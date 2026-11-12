import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import automodCommand from "./commands/automod.js";
import autoroleCommand from "./commands/autorole.js";
import backupCommand from "./commands/backup.js";
import botControlCommand from "./commands/botControl.js";
import configCommand from "./commands/config.js";
import giveawayCommand, { scheduleExistingGiveaways } from "./commands/giveaway.js";
import gamesCommand from "./commands/games.js";
import informationCommand from "./commands/information.js";
import levelsCommand from "./commands/levels.js";
import moderationCommand from "./commands/moderation.js";
import serverConfigCommand from "./commands/serverConfig.js";
import ticketCommand from "./commands/tickets.js";
import utilitiesCommand from "./commands/utilities.js";
import vipCommand from "./commands/vip.js";
import { handleAutomodMessage } from "./events/automod.js";
import { registerGuildLogs } from "./events/guildLogs.js";
import { registerMemberEvents } from "./events/memberEvents.js";
import { Store } from "./services/store.js";
import { createEmbed } from "./utils/embeds.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN est manquant. Configure-le dans .env ou dans les variables de l'hébergeur.");
  process.exit(1);
}

const commands = [
  configCommand,
  moderationCommand,
  gamesCommand,
  informationCommand,
  levelsCommand,
  giveawayCommand,
  backupCommand,
  automodCommand,
  autoroleCommand,
  vipCommand,
  botControlCommand,
  serverConfigCommand,
  ticketCommand,
  utilitiesCommand,
];
const commandMap = new Map(
  commands.flatMap((command) => {
    const definitions = Array.isArray(command.data) ? command.data : [command.data];
    return definitions.map((definition) => [definition.name, command]);
  }),
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});
const store = await new Store().load();

async function registerCommands() {
  const clientId = process.env.DISCORD_CLIENT_ID ?? client.user.id;
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.flatMap((command) => {
    const definitions = Array.isArray(command.data) ? command.data : [command.data];
    return definitions.map((definition) =>
      typeof definition.toJSON === "function" ? definition.toJSON() : definition,
    );
  });
  const route = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body });
  console.info(`${body.length} commandes slash enregistrées.`);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.info(`Connecté en tant que ${readyClient.user.tag}.`);
  scheduleExistingGiveaways(client, store);
  try {
    await registerCommands();
  } catch (error) {
    console.error("L'enregistrement des commandes slash a échoué :", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    try {
      if (await backupCommand.handleButton(interaction, { client, store })) return;
      if (await giveawayCommand.handleButton(interaction, { client, store })) return;
      if (await ticketCommand.handleButton(interaction, { client, store })) return;
    } catch (error) {
      console.error("Erreur dans une interaction par bouton :", error);
      const message = "Cette action n'a pas pu être exécutée. Réessaie.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, { client, store });
  } catch (error) {
    console.error(`Erreur dans /${interaction.commandName} :`, error);
    const message = "La commande a échoué. Vérifie les permissions du bot et réessaie.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  if (await handleAutomodMessage(message, store)) return;
  const settings = store.getGuildSettings(message.guild.id);
  if (!settings.levelsEnabled) return;
  try {
    const result = await store.addMessageXp(message.guild.id, message.author.id);
    if (!result.leveledUp) return;
    await message.channel.send({
      embeds: [createEmbed("Nouveau niveau", `${message.author} passe au niveau **${result.level}**.`)],
    });
  } catch (error) {
    console.error("La mise à jour des XP a échoué :", error);
  }
});

registerMemberEvents(client, store);
registerGuildLogs(client, store);

client.on(Events.Error, (error) => console.error("Erreur Discord :", error));
process.on("unhandledRejection", (error) => console.error("Erreur asynchrone non gérée :", error));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} reçu : arrêt propre et sauvegarde des données.`);
  client.destroy();
  try {
    await store.flush();
  } catch (error) {
    console.error("La dernière sauvegarde a échoué :", error);
    process.exitCode = 1;
  }
  process.exit();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(token);
} catch (error) {
  console.error("Connexion à Discord impossible. Vérifie le token et les intents :", error);
  process.exit(1);
}

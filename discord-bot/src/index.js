import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import configCommand from "./commands/config.js";
import gamesCommand from "./commands/games.js";
import informationCommand from "./commands/information.js";
import levelsCommand from "./commands/levels.js";
import moderationCommand from "./commands/moderation.js";
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
  ],
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
  try {
    await registerCommands();
  } catch (error) {
    console.error("L'enregistrement des commandes slash a échoué :", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
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

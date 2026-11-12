import "dotenv/config";
import { REST, Routes } from "discord.js";
import configCommand from "./commands/config.js";
import gamesCommand from "./commands/games.js";
import informationCommand from "./commands/information.js";
import levelsCommand from "./commands/levels.js";
import moderationCommand from "./commands/moderation.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("Renseigne DISCORD_TOKEN et DISCORD_CLIENT_ID dans le fichier .env.");
  process.exit(1);
}

const commands = [
  ...configCommand.data,
  ...moderationCommand.data,
  ...gamesCommand.data,
  ...informationCommand.data,
  ...levelsCommand.data,
];

const rest = new REST({ version: "10" }).setToken(token);
const route = process.env.DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(clientId);

try {
  const registered = await rest.put(route, { body: commands });
  console.info(`${registered.length} commandes slash enregistrées.`);
} catch (error) {
  console.error("L'enregistrement des commandes a échoué :", error);
  process.exitCode = 1;
}

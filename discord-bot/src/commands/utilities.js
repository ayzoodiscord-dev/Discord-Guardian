import { SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = [
  new SlashCommandBuilder()
    .setName("choisir")
    .setDescription("Choisit une option au hasard")
    .addStringOption((option) => option.setName("options").setDescription("Options séparées par un point-virgule").setMaxLength(1000).setRequired(true)),
  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Tire un nombre aléatoire dans un intervalle")
    .addIntegerOption((option) => option.setName("minimum").setDescription("Borne minimale").setMinValue(-1_000_000).setMaxValue(1_000_000).setRequired(true))
    .addIntegerOption((option) => option.setName("maximum").setDescription("Borne maximale").setMinValue(-1_000_000).setMaxValue(1_000_000).setRequired(true)),
  new SlashCommandBuilder()
    .setName("calcul")
    .setDescription("Effectue une opération arithmétique")
    .addNumberOption((option) => option.setName("a").setDescription("Premier nombre").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("operation")
        .setDescription("Opération")
        .setRequired(true)
        .addChoices(
          { name: "Addition", value: "add" },
          { name: "Soustraction", value: "subtract" },
          { name: "Multiplication", value: "multiply" },
          { name: "Division", value: "divide" },
        ),
    )
    .addNumberOption((option) => option.setName("b").setDescription("Deuxième nombre").setRequired(true)),
  new SlashCommandBuilder()
    .setName("timestamp")
    .setDescription("Convertit une date ISO en heure Discord")
    .addStringOption((option) => option.setName("date").setDescription("Date ISO, par exemple 2026-12-24T18:30:00+01:00").setMaxLength(40).setRequired(true)),
].map((command) => command.toJSON());

async function execute(interaction) {
  const command = interaction.commandName;
  if (command === "choisir") {
    const choices = interaction.options.getString("options", true).split(";").map((item) => item.trim()).filter(Boolean);
    if (choices.length < 2 || choices.length > 25) {
      return respond(interaction, { content: "Indique entre 2 et 25 options séparées par des points-virgules.", ephemeral: true });
    }
    const selected = choices[Math.floor(Math.random() * choices.length)];
    return respond(interaction, { embeds: [createEmbed("Choix au hasard", `Options : ${choices.join(" · ")}\n\n**Résultat : ${selected}**`)] });
  }

  if (command === "random") {
    const min = interaction.options.getInteger("minimum", true);
    const max = interaction.options.getInteger("maximum", true);
    if (min > max) return respond(interaction, { content: "Le minimum doit être inférieur ou égal au maximum.", ephemeral: true });
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return respond(interaction, { embeds: [createEmbed("Nombre aléatoire", `Tirage entre ${min} et ${max} : **${value}**`)] });
  }

  if (command === "calcul") {
    const a = interaction.options.getNumber("a", true);
    const b = interaction.options.getNumber("b", true);
    const operation = interaction.options.getString("operation", true);
    if (operation === "divide" && b === 0) {
      return respond(interaction, { content: "La division par zéro n'est pas définie.", ephemeral: true });
    }
    const result = {
      add: a + b,
      subtract: a - b,
      multiply: a * b,
      divide: a / b,
    }[operation];
    return respond(interaction, { embeds: [createEmbed("Calcul", `${a} ${({ add: "+", subtract: "−", multiply: "×", divide: "÷" })[operation]} ${b} = **${Number(result.toPrecision(12))}**`)] });
  }

  const input = interaction.options.getString("date", true);
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) {
    return respond(interaction, { content: "Date invalide. Utilise le format ISO, par exemple 2026-12-24T18:30:00+01:00.", ephemeral: true });
  }
  const unix = Math.floor(timestamp / 1000);
  return respond(interaction, {
    embeds: [createEmbed("Date Discord", `Date : <t:${unix}:F>\nTemps relatif : <t:${unix}:R>\nTimestamp : \`${unix}\``)],
  });
}

export default { data, execute };

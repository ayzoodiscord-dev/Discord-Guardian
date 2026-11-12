import { SlashCommandBuilder } from "discord.js";
import { createEmbed, respond } from "../utils/embeds.js";

const data = [
  new SlashCommandBuilder().setName("pileouface").setDescription("Lance une pièce"),
  new SlashCommandBuilder()
    .setName("de")
    .setDescription("Lance un dé")
    .addIntegerOption((option) => option.setName("faces").setDescription("Nombre de faces").setMinValue(2).setMaxValue(100).setRequired(false)),
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Demande conseil à la boule magique")
    .addStringOption((option) => option.setName("question").setDescription("Ta question").setMaxLength(300).setRequired(true)),
  new SlashCommandBuilder()
    .setName("shifumi")
    .setDescription("Joue à pierre-feuille-ciseaux")
    .addStringOption((option) =>
      option
        .setName("choix")
        .setDescription("Ton choix")
        .setRequired(true)
        .addChoices(
          { name: "Pierre", value: "pierre" },
          { name: "Feuille", value: "feuille" },
          { name: "Ciseaux", value: "ciseaux" },
        ),
    ),
].map((command) => command.toJSON());

const answers = [
  "Oui, sans aucun doute.",
  "C'est très probable.",
  "Les signes sont favorables.",
  "Mieux vaut réessayer plus tard.",
  "Impossible à prévoir pour l'instant.",
  "Ne compte pas dessus.",
  "C'est peu probable.",
  "La réponse est non.",
];

async function execute(interaction) {
  const command = interaction.commandName;
  if (command === "pileouface") {
    const result = Math.random() < 0.5 ? "Pile" : "Face";
    return respond(interaction, { embeds: [createEmbed("Pile ou face", `Résultat : **${result}**`)] });
  }
  if (command === "de") {
    const faces = interaction.options.getInteger("faces") ?? 6;
    const result = Math.floor(Math.random() * faces) + 1;
    return respond(interaction, { embeds: [createEmbed("Lancer de dé", `Dé à ${faces} faces : **${result}**`)] });
  }
  if (command === "8ball") {
    const question = interaction.options.getString("question", true);
    const answer = answers[Math.floor(Math.random() * answers.length)];
    return respond(interaction, { embeds: [createEmbed("Boule magique", `**Question :** ${question}\n**Réponse :** ${answer}`)] });
  }

  const choices = ["pierre", "feuille", "ciseaux"];
  const userChoice = interaction.options.getString("choix", true);
  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  const userWins = (userChoice === "pierre" && botChoice === "ciseaux")
    || (userChoice === "feuille" && botChoice === "pierre")
    || (userChoice === "ciseaux" && botChoice === "feuille");
  const result = userChoice === botChoice ? "Égalité" : userWins ? "Tu as gagné" : "Le bot a gagné";
  return respond(interaction, { embeds: [createEmbed("Pierre-feuille-ciseaux", `Ton choix : **${userChoice}**\nChoix du bot : **${botChoice}**\n\n**${result}**`)] });
}

export default { data, execute };

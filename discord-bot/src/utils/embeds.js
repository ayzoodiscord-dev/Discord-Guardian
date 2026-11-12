import { EmbedBuilder } from "discord.js";

export const EMBED_COLOR = 0xffffff;

export function createEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

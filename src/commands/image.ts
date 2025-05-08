import { SlashCommandBuilder } from "discord.js";
import { msgToAI } from "../ai-message-handling";
import Roboto from "../roboto";
import i18n from "../locales";

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription(i18n.t("commands.image.description"))
  .addStringOption(option =>
    option.setName('prompt')
      .setDescription(i18n.t("commands.image.promptDescription"))
      .setRequired(false));

export async function execute(interaction: any) {

    interaction.deferReply();

    const guild = interaction.guild;
    const imgPrompt = interaction.options.getString('prompt');

    const botResponseMsg = await msgToAI(interaction, Roboto.getGuildData(guild.id), imgPrompt);
    if (!botResponseMsg) return;

    return interaction.editReply(botResponseMsg.message);
}

import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import { MusicAction } from "../interfaces/discord-interfaces";
import i18n from "../locales";

export const data = new SlashCommandBuilder()
  .setName("resume")
  .setDescription(i18n.t('commands.resume.description'));

export async function execute(interaction: CommandInteraction) {
  return await Roboto.musicService.musicButtonHandle(interaction, MusicAction.RESUME);
}

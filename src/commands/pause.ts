import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import { MusicAction } from "../interfaces/discord-interfaces";
import i18n from "../locales";

export const data = new SlashCommandBuilder()
  .setName("pause")
  .setDescription(i18n.t('commands.pause.description'));

export async function execute(interaction: CommandInteraction) {
  return await Roboto.musicService.musicButtonHandle(interaction, MusicAction.PAUSE);
}

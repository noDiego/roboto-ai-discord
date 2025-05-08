import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import i18n from "../locales";
import Roboto from "../roboto";
import { MusicAction } from "../interfaces/discord-interfaces";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription(i18n.t("commands.skip.description"));

export async function execute(interaction: CommandInteraction) {
  return await Roboto.musicService.musicButtonHandle(interaction, MusicAction.SKIP);
}

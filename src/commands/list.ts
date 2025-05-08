import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import i18n from "../locales";

export const data = new SlashCommandBuilder()
  .setName("list")
  .setDescription(i18n.t('commands.list.description'));

export async function execute(interaction: CommandInteraction) {
  const songList = buildSongList(interaction);

  const msgEmbd = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(i18n.t('commands.list.title'))
      .setDescription(songList != "" ? songList : i18n.t('commands.list.emptyMsg'))

  return await interaction.reply({embeds: [msgEmbd], flags: 'Ephemeral'});
}

export function buildSongList(interaction: CommandInteraction) {
  let songList = "";
  const guildData = Roboto.getGuildData(interaction.guildId!);

  if (guildData.songsQueue.length >= 1) {
    guildData.songsQueue.forEach(songInfo => {
      songList = songList + "\n- " + songInfo.title + ` (${songInfo.provider})`;
    })
  }

  return songList;
}

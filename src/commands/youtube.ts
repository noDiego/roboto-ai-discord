import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import logger from '../logger';
import i18n from "../locales";
import Roboto from '../roboto';
import { MusicProvider } from "../interfaces/guild-data";

export const data = new SlashCommandBuilder()
  .setName('p')
  .setDescription(i18n.t('commands.youtube.description'))
  .addStringOption(option =>
    option.setName('query')
      .setDescription(i18n.t('commands.youtube.queryDescription'))
      .setRequired(true));

export async function execute(interaction: CommandInteraction) {
  try {
    await interaction.deferReply();

    const query = interaction.options.get('query').value as string;
    const isPlaylist = query.includes('list=') && query.startsWith('http');
    logger.info(`Received search for YouTube: "${query}"`);

    // Search
    const searchResult = await Roboto.musicService.search(query, MusicProvider.YOUTUBE);
    if (!searchResult.success || !searchResult.result?.length) {
      return interaction.editReply({
        content: i18n.t('responses.noresults', { query })
      });
    }

    const firstTrack = searchResult.result[0];
    const addResult = await Roboto.musicService.addToQueue(
        interaction,
        isPlaylist ? searchResult.result : [firstTrack]
    );

    const extra =
        searchResult.result.length > 1
            ? i18n.t('responses.andMore', { count: searchResult.result.length - 1 })
            : '';

    // Case: added and starts to sound immediately (code 10)
    if (addResult.success && addResult.code === 10) {
      return interaction.editReply(
          i18n.t('responses.addedToQueue', { title: firstTrack.title, extra })
      );
    }

    // Case: added but in queue (code 11)
    let reply = '';
    if (addResult.success && addResult.code === 11) {
      reply = i18n.t('responses.addedToQueue', { title: firstTrack.title, extra }) + ' ';
    }

    // If it was not a playlist or code 11, we try to start playback
    const playResult = await Roboto.musicService.startPlayback(interaction);
    if (playResult.success) {
      return interaction.editReply(
          reply + i18n.t('responses.nowPlaying', { title: firstTrack.title })
      );
    } else {
      return interaction.editReply(
          i18n.t('responses.errorPlaying', { title: firstTrack.title, error: playResult.error })
      );
    }
  } catch (e) {
    logger.error(e);
    return interaction.editReply({
      content: i18n.t('responses.error')
    });
  }
}

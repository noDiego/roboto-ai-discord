import { BotInput, MusicAction } from '../interfaces/discord-interfaces';
import { GuildData, MusicProvider, SongInfo } from '../interfaces/guild-data';
import YoutubeService from './youtube-service';
import { ActionResult } from '../interfaces/action-result';
import Roboto from '../roboto';
import { EmbedBuilder, GuildTextBasedChannel } from 'discord.js';
import { getMusicButtons, getUserName, temporalMsg } from '../utils';
import logger from '../logger';
import { searchMP3, startMP3Playback } from "./mp3-service";
import i18n from "../locales";


export class MusicService {

  private youtubeService: YoutubeService;

  constructor() {
    this.youtubeService = new YoutubeService();
  }

  async search(query: string, provider: MusicProvider, maxResults?: number): Promise<ActionResult<SongInfo[]>>{

    let results: SongInfo[] = [];

    switch (provider) {
      case 'YOUTUBE':
        results = await this.youtubeService.search(query);
        break;
      case 'MP3':
        results = searchMP3(query);
        break;
    }
    if (maxResults) results = results.slice(0, maxResults);
    if (results.length === 0) return {success: false, code: 2, resultMsg: 'No results'};
    return { success: true, result: results, code: 0 };
  }

  async addToQueue(input: BotInput, songs: SongInfo[]): Promise<ActionResult>{
    const guildData: GuildData = Roboto.getGuildData(input.guildId!);
    const audioPlayer = await Roboto.discordService.getAudioPlayer(input);
    const channel = input.channel as GuildTextBasedChannel;

    guildData.songsQueue.push(...songs);
    const actualStatus = audioPlayer.state.status;

    if(songs.length >= 1 && (actualStatus == 'playing' || guildData.songsQueue.length > 1)) {
      const msgEmbd = songs.length == 1 ? new EmbedBuilder()
              .setColor(0x0099FF)
              .setTitle(songs[0].title)
              .setURL(songs[0].url)
              .setAuthor({name: i18n.t('musicplayer.authorAddingOne'), url: songs[0].url})
              .setThumbnail(songs[0].thumbnail) :
          new EmbedBuilder()
              .setColor(0x0099FF)
              .setAuthor({name: i18n.t('musicplayer.authorAddingMany', {count: songs.length})})
              .setThumbnail(songs[0].thumbnail);

      channel.send({embeds: [msgEmbd]});
      logger.debug(`Added ${songs.length} songs. Player Status:"${actualStatus}"`)
      return { success: true, result: songs, code: actualStatus == 'playing'? 10 : 11 };
    }

    logger.debug(`Added 1 song. Player Status:"${actualStatus}"`)
    return { success: true, result: songs, code: 0 };
  }

  async startPlayback(input: BotInput){
    const guildData = Roboto.getGuildData(input.guildId!);

    if(guildData.songsQueue.length == 0) return { success: false, code: -1, resultMsg: 'No songs on queue'};

    const song = guildData.songsQueue.shift();
    let result: ActionResult;

    switch (song.provider){
      case MusicProvider.YOUTUBE:
        result = await this.youtubeService.startYTPlayback(input, song);
        break;
      case MusicProvider.MP3:
        result = await startMP3Playback(input, song);
        break;
      case MusicProvider.SOUNDCLOUD:
    }

    if(!result.success) return result;

    this.showMusicPlayer(input, song);
    this.setIdleListener(input);

    guildData.currentSongInfo = song;

    return { success: true, code: 0, replied: true, result: song };
  }

  async showMusicPlayer(input: BotInput, song: SongInfo){
    const channel = input.channel as GuildTextBasedChannel;
    const guildData = Roboto.getGuildData(input.guildId!);

    await this.removeGuildMusicMsg(guildData);

    const msgEmbd = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(song.title)
      .setURL(song.url)
      .setAuthor({name: i18n.t('musicplayer.authorListening'), url: song.url})
      .setThumbnail(song.thumbnail);

    const buttonsRow = getMusicButtons();
    const msg = await channel.send({embeds: [msgEmbd], components: [buttonsRow as any]});
    return guildData.currentMusicMsg = msg;
  }

  public async setIdleListener(input: BotInput) {
    const audioPlayer = await Roboto.discordService.getAudioPlayer(input);

    const onIdle = async () => {

      const guildData = Roboto.getGuildData(input.guildId!);
      await this.removeGuildMusicMsg(guildData);

      if (guildData.songsQueue.length > 0) await this.startPlayback(input);
    };

    if (!audioPlayer.listeners('idle').includes(onIdle)) {
      audioPlayer.once('idle', onIdle);
    }
  }

  public async musicButtonHandle(input: BotInput, action: MusicAction): Promise<boolean> {

    try {
      const guildData = Roboto.getGuildData(input.guildId!);
      const guildChannel = input.channel as GuildTextBasedChannel;
      const audioPlayer = await Roboto.discordService.getAudioPlayer(input);

      switch (action) {
        case MusicAction.STOP:
          temporalMsg(await guildChannel.send(i18n.t("commands.stop.response", { name: getUserName(input)})));
          guildData.songsQueue.length = 0;
          return audioPlayer.stop(true);
        case MusicAction.SKIP:
          temporalMsg(await guildChannel.send(i18n.t("commands.skip.response", { name: getUserName(input), title: guildData.currentSongInfo.title})));
          return audioPlayer.stop(true);
        case MusicAction.PAUSE:
          if (guildData.currentMusicMsg) await guildData.currentMusicMsg.edit({components: [getMusicButtons(true) as any]});
          temporalMsg(await guildChannel.send(i18n.t("commands.pause.response", { name: getUserName(input), title: guildData.currentSongInfo.title})));
          return audioPlayer.pause();
        case MusicAction.RESUME:
          if (guildData.currentMusicMsg) await guildData.currentMusicMsg.edit({components: [getMusicButtons(false) as any]});
          temporalMsg(await guildChannel.send(i18n.t("commands.resume.response", { name: getUserName(input), title: guildData.currentSongInfo.title})));
          return audioPlayer.unpause();
        default:
          return false;
      }
    }catch (e){
      logger.error(e.error);
      return false;
    }
  }

  private async removeGuildMusicMsg(guildData: GuildData) {
    try {
      delete guildData.currentSongInfo;
      if (!!guildData.currentMusicMsg && guildData.currentMusicMsg.deletable)
        await guildData.currentMusicMsg.delete();
    } catch (e: any) {
      logger.error(`Error deleting music message: ${e.message}`);
    } finally {
      delete guildData.currentMusicMsg;
    }
  }

}

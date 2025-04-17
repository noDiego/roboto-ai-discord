import {GuildTextBasedChannel, Interaction, Message} from 'discord.js';
import { commands } from './commands';
import { GuildData, MusicProvider } from './interfaces/guild-data';
import { BotInput, MusicAction } from './interfaces/discord-interfaces';
import { OpenAIService } from './services/openai-service';
import {cleanMessage, musicControlAction, replyLongMessage, sleep} from './utils';
import logger from './logger';
import { msgToAI } from './ai-message-handling';
import { DiscordService } from './services/discord-service';
import { MusicService } from './services/music-service';
import i18n from './locales';
import {Readable} from "stream";
import {Stream} from "openai/streaming";
import {AIAnswer} from "./interfaces/ai-interfaces";
import {PassThrough} from "node:stream";
import {CONFIG} from "./config";

class RobotoClass{

  private _guildDataList: GuildData[] = [];
  private _openAI: OpenAIService;
  private _musicService: MusicService;
  private _discordService: DiscordService;

  constructor() {
    this._openAI = new OpenAIService();
    this._discordService = new DiscordService();
    this._musicService = new MusicService();
  }

  public async handleMessage(message: Message){
    if (message.content.includes(`@${CONFIG.botClientID}`) || message.content.toLowerCase().includes(CONFIG.botName.toLowerCase())) {
      return await Roboto.mentionExecute(message);
    }
    if(!message.reference) return;

    const channel = message.channel as GuildTextBasedChannel;
    const referencedMsg = await channel.messages.fetch(message.reference.messageId);
    if(referencedMsg.author.id == CONFIG.botClientID)
      return await Roboto.mentionExecute(message);
    return;
  }

  public async handleInteraction(interaction: Interaction) {
    if (interaction.isCommand()) {
      const guildData = this.getGuildData(interaction.guildId);
      try {
        while(guildData.isBusy){
          await sleep(1000);
        }
        guildData.isBusy = true;
        const commandName = interaction.commandName;
        if (commands[commandName as keyof typeof commands]) {
          await commands[commandName as keyof typeof commands].execute(interaction);
        }
      } finally {
        guildData.isBusy = false;
      }
    }
    else if (interaction.isAutocomplete()){
      const commandName = interaction.commandName;
      if (commands[commandName as keyof typeof commands]) {
        (commands[commandName as keyof typeof commands] as any).autocomplete(interaction);
      }
    }
    else if (interaction.isButton()) {
      const customId = interaction.customId;

      if (Object.values(MusicAction).includes(customId as MusicAction))
        await this._musicService.musicButtonHandle(interaction as any, customId as MusicAction);

      return;
    }
  }

  async mentionExecute(message: Message){
    const guildData = this.getGuildData(message.guildId);

    try {
      while(guildData.isBusy){
        await sleep(1000);
      }
      guildData.isBusy = true;

      const repliedMsg = await message.reply(i18n.t('responses.thinking'));

      const botResponseMsg = await msgToAI(message);

      if(botResponseMsg.type.toLocaleLowerCase() == 'voice')
        this.speakTextStream(message, botResponseMsg.message);

      return await replyLongMessage(repliedMsg, botResponseMsg.message, true);

    }catch (e){
      logger.error(e.message);
      return message.reply({content: 'Error ☹️'});
    }finally {
      guildData.isBusy = false;
    }
  }

  public async executeFunctions(functionName: string, args: any, inputData: BotInput): Promise<string>{
    const handlers: Record<string, (args: any, inputData: BotInput) => Promise<string>> = {

      play_youtube_song: async (args, inputData) => {
        const searchResult = await this._musicService.search(inputData, args.query, MusicProvider.YOUTUBE);

        if (searchResult.success && searchResult.code === 10)
          return `Added to the playlist: "${searchResult.result[0].title}"`+ (searchResult.result.length>1?` and ${searchResult.result.length - 1} more songs.`:``);
        if (!searchResult.success)
          return `No song was found on YouTube that matches: "${args.query}".`;

        const playResult = await this._musicService.startPlayback(inputData);

        if (playResult.success){
          return `Playing: "${searchResult.result[0].title}".`;
        }else {
          return `Error playing: "${searchResult.result[0].title}". ${playResult.error}`
        }

      },

      play_mp3: async (args, inputData) => {
        const searchResult = await this._musicService.search(inputData, args.query, MusicProvider.MP3);

        if (searchResult.success && searchResult.code === 10)
          return `Added to the playlist: "${searchResult.result[0].title}"`+ (searchResult.result.length>1?` and ${searchResult.result.length - 1} more songs.`:``);
        if (!searchResult.success)
          return `No mp3 file was found that matches: "${args.query}".`

        const playResult = await this._musicService.startPlayback(inputData);

        if (playResult.success){
          return `Playing: "${searchResult.result[0].title}".`;
        } else {
          return `Error playing: "${searchResult.result[0].title}". ${playResult.error}`
        }

      },

      get_songs_queue: async (args, inputData) => {
        const guildData = this.getGuildData(inputData.guildId);
        const songList = guildData.songsQueue.map(song => ({
          title: song.title,
          provider: song.provider,
          timestamp: song.duration
        }));
        return JSON.stringify(songList || []);
      },

      get_current_playing_song: async (args, inputData) => {
        const guildData = this.getGuildData(inputData.guildId);
        return guildData.currentSongInfo? JSON.stringify(guildData.currentSongInfo) : `There is nothing currently playing`;
      },

      remove_song_from_queue: async (args, inputData) => {
        const guildData = this.getGuildData(inputData.guildId);
        const result = this.removeSongFromQueue(guildData, args.title);
        return result? 'Succesfully removed':`"${args.title}" not found.`;
      },

      clear_songs_queue: async (args, inputData) => {
        const guildData = this.getGuildData(inputData.guildId);
        return this.clearQueueSongs(guildData)? `Songs queue cleared.`: `Error clearing songs queue.`;
      },

      control_music_player: async (args, inputData) => {
        let functionResult = await this._musicService.musicButtonHandle(inputData, musicControlAction(args.action.toUpperCase()));
        return functionResult ? `Action "${args.action}" executed successfully` : `Error executing action "${args.action}"`;
      }
    };
    try {
      if (handlers[functionName]) {
        return await handlers[functionName](args, inputData);
      }
      return `Function not recognized: ${functionName}`;
    } catch (error) {
      logger.error(error.message);
      return `Error executing function: ${functionName}`;
    }
  }

  private removeSongFromQueue(guildData: GuildData, title: string): boolean {
    const index = guildData.songsQueue.findIndex(s => s.title.includes(title));
    if (index > -1)
      guildData.songsQueue.splice(index, 1);
    return index > -1;
  }

  private clearQueueSongs(guildData: GuildData): boolean {
    guildData.songsQueue = [];
    return true;
  }

  async speakTextStream(input: BotInput, msgToSay: string, voice?: string) {
    const cleanedMsg = cleanMessage(msgToSay);
    logger.debug(`Text to pronounce: ${cleanedMsg}`);

    try {
      const openAIStream = await this.openAI.speechStream(cleanedMsg);

      const nodeStream = Readable.fromWeb(openAIStream.toReadableStream() as any);

      await this.discordService.playAudio(input, nodeStream);
    } catch (error) {
      logger.error(`Error in speechStream: ${error.message}`);
    }
  }

  public getGuildData(guildId: string): GuildData{
    let guildData = this._guildDataList.find(l => l.guildId == guildId);
    if(!guildData){
      guildData = {
        guildId: guildId,
        songsQueue: [],
        isBusy : false
      }
      this._guildDataList.push(guildData)
    }
    return guildData;
  }

  get openAI(): OpenAIService {
    return this._openAI;
  }

  get discordService(): DiscordService {
    return this._discordService;
  }

}

const Roboto = new RobotoClass();
export default Roboto;

import { AttachmentBuilder, GuildTextBasedChannel, Interaction, Message } from 'discord.js';
import { commands } from './commands';
import { GuildData, MusicProvider, SongInfo } from './interfaces/guild-data';
import { BotInput, MusicAction } from './interfaces/discord-interfaces';
import { OpenAIService } from './services/openai-service';
import { bufferToStream, cleanMessage, imageToBase64, musicControlAction, replyLongMessage, sleep } from './utils';
import logger from './logger';
import { msgToAI } from './ai-message-handling';
import { DiscordService } from './services/discord-service';
import { MusicService } from './services/music-service';
import i18n from './locales';
import { CONFIG } from "./config";
import { AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";
import { guildConfigurationManager } from "./config/guild-configurations";
import { ElevenLabsService } from "./services/eleven-service";

class RobotoClass{

  private _guildDataList: GuildData[] = [];
  private _openAI: OpenAIService;
  private _musicService: MusicService;
  private _discordService: DiscordService;
  private _elevenLabsService: ElevenLabsService;

  constructor() {
    this._openAI = new OpenAIService();
    this._discordService = new DiscordService();
    this._musicService = new MusicService();
    this._elevenLabsService = new ElevenLabsService();
  }

  public async handleMessage(message: Message){
    const guildData = this.getGuildData(message.guildId, message.guild?.name);
    if (message.content.includes(`@${CONFIG.botClientID}`) || message.content.toLowerCase().includes(guildData.guildConfig.botName.toLowerCase())) {
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
    const guildData = this.getGuildData(interaction.guildId, interaction.guild?.name);
    if (interaction.isCommand()) {
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

      if (Object.values(MusicAction).includes(customId as MusicAction)) {
        interaction.deferUpdate();
        await this._musicService.musicButtonHandle(interaction as any, customId as MusicAction);
        return true;
      }

      return false;
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

      const botResponseMsg = await msgToAI(message, guildData);
      if(!botResponseMsg) return;

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

      search_youtube: async (args) => {
        const searchResult = await this._musicService.search(args.query, MusicProvider.YOUTUBE);
        if (!searchResult.success)
          return `No song was found on YouTube that matches: "${args.query}".`;
        return `Song Object Results: ${JSON.stringify(searchResult.result)}`;
      },

      web_search: async (args) => {
        const searchResult = await this._openAI.webSearch(args.query);
        if (!searchResult)
          return `No song was found on YouTube that matches: "${args.query}".`;
        return `Search result: "${searchResult}"`;
      },

      play_youtube_song: async (args, inputData) => {
        const songList: SongInfo[] = args.songs;
        const addResult = await this._musicService.addToQueue(inputData, songList);
        let functionResult = '';

        if (addResult.success && addResult.code === 10)
          return `Added to the queue: "${songList[0].title}"`+ (songList.length>1?` and ${songList.length - 1} more songs.`:``);
        if (addResult.success && addResult.code === 11)
          functionResult = `Added to the queue: "${songList[0].title}"`+ (songList.length>1?` and ${songList.length - 1} more songs. `:``);
        if (!addResult.success)
          return `Error adding songs to queue`;

        const playResult = await this._musicService.startPlayback(inputData);

        if (playResult.success){
          return `${functionResult}Playing: "${songList[0].title}".`;
        }else {
          return `Error playing: "${songList[0].title}". ${playResult.error}`
        }

      },

      play_mp3: async (args, inputData) => {
        const searchResult = await this._musicService.search(args.query, MusicProvider.MP3);
        const addResult = await this._musicService.addToQueue(inputData, searchResult.result);
        let functionResult = '';

        if (addResult.success && addResult.code === 10)
          return `Added to the queue: "${searchResult.result[0].title}"`+ (searchResult.result.length>1?` and ${searchResult.result.length - 1} more songs.`:``);
        if (addResult.success && addResult.code === 11)
          functionResult = `Added to the queue: "${searchResult.result[0].title}"`+ (searchResult.result.length>1?` and ${searchResult.result.length - 1} more songs. `:``);
        if (!addResult.success)
          return `No mp3 file was found that matches: "${args.query}".`

        const playResult = await this._musicService.startPlayback(inputData);

        if (playResult.success){
          return `${functionResult}Playing: "${searchResult.result[0].title}".`;
        } else {
          return `Error playing: "${searchResult.result[0].title}". ${playResult.error}`
        }

      },

      get_songs_queue: async (args, inputData) => {
        const guildData = this.getGuildData(inputData.guildId);
        if (guildData.songsQueue.length == 0) return `<Empty list>`;
        const songList: any[] = guildData.songsQueue.map(song => ({
          title: song.title,
          provider: song.provider
        }));
        if(guildData.currentSongInfo) songList.unshift({
          title: guildData.currentSongInfo.title,
          provider: guildData.currentSongInfo.provider,
          status: 'Currently playing'
        });
        return `This is the list, remember to format it as "bullet points" and without messages in the end: ${JSON.stringify(songList || [])}`;
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
      },

      generate_speech: async (args, inputData) => {
        const {input, instructions, voice} = args;
        await this.speakTextStream(inputData, input, instructions, CONFIG.OPENAI.speechVoice ?? voice);
        return `The audio message was generated successfully. Now, you should respond using this message so that the user can also read it: "${input}"`;
      },

      create_image: async (args) => {
        const guildData = this.getGuildData(inputData.guildId);
        if (!CONFIG.imageCreationEnabled || !guildData.guildConfig.imageCreationEnabled) return `The image creation is disabled by an Administrator.`

        logger.info(`Creating image for prompt "${JSON.stringify(args.prompt)}"`)

        try {
          const channel = inputData.channel as GuildTextBasedChannel;
          const imageCreation = await this.openAI.createImage(args.prompt, {
            background: args.background,
            quality: 'medium', size: "1536x1024",
            output_format: args.outputFormat
          });

          const sfbuff = Buffer.from(imageCreation[0].b64_json, "base64");

          const attachment = new AttachmentBuilder(sfbuff, {name: 'image.'+args.outputFormat});
          channel.send({files: [attachment]});

          return 'Image sent successfully.';
        } catch (e) {
          logger.error(e.message);
          return `Error creating image: "${e.message}"`;
        }
      },

      edit_image: async (args) => {
        const guildData = this.getGuildData(inputData.guildId);
        if (!CONFIG.imageCreationEnabled || !guildData.guildConfig.imageCreationEnabled) return `The image creation is disabled by an Administrator.`

        logger.info(`Editing image for prompt "${JSON.stringify(args.prompt)}"`)

        const channel = inputData.channel as GuildTextBasedChannel;

        const imageStreams = await Promise.all(
            args.imageIds.map(async (imageId: string) => {

              const refMsg = await channel.messages.fetch(imageId)
              if (!refMsg) throw new Error(`No se encontró ningún mensaje con imageId=${imageId}`);

              const attachment = refMsg.attachments.first();
              const base64Image = await imageToBase64(attachment.url);

              const buffer = Buffer.from(base64Image, 'base64');
              return bufferToStream(buffer);
            })
        );

        let maskStream;
        if (args.mask) maskStream = bufferToStream(Buffer.from(args.mask, 'base64'));

        try {
          const edited = await this.openAI.editImage(imageStreams, args.prompt, maskStream, {
            background: args.background,
            quality: CONFIG.OPENAI.imageQuality, size: "1536x1024",
            output_format: args.outputFormat
          });

          const sfbuff = Buffer.from(edited[0].b64_json, "base64");
          const attachment = new AttachmentBuilder(sfbuff, {name: 'image.'+args.outputFormat});
          channel.send({files: [attachment]});

          return 'Image sent successfully.';
        } catch (e) {
          logger.error(e.message);
          return `Error creating image: "${e.message}"`;
        }
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

  async speakTextStream(input: BotInput, msgToSay: string, instructions?: string, voice?: string) {

    const ttsProvider = this.getGuildData(input.guildId).guildConfig.ttsProvider;

    try {
      const connection = await this.discordService.getGuildVoiceConnection(input);
      const musicPlayer = await this.discordService.getAudioPlayer(input);
      const wasPlaying = musicPlayer.state.status === AudioPlayerStatus.Playing;
      const cleanedMsg = cleanMessage(msgToSay);

      const ttsPlayer = createAudioPlayer();
      let ttsStream;
          ttsStream = ttsProvider == 'OPENAI' ? await this.openAI.speechStream(cleanedMsg, instructions, voice) :
          await this._elevenLabsService.ttsStream(msgToSay, CONFIG.ELEVENLABS.speechVoice);

      connection.subscribe(ttsPlayer);

      if (wasPlaying) musicPlayer.pause();

      logger.debug(`Text to pronounce: ${cleanedMsg}`);

      const onTtsIdle = (oldState, newState) => {
        if (newState.status === AudioPlayerStatus.Idle) {
          connection.subscribe(musicPlayer);
          if (wasPlaying) musicPlayer.unpause();
          ttsPlayer.removeListener('stateChange', onTtsIdle);
          ttsPlayer.stop();
        }
      };
      ttsPlayer.on('stateChange', onTtsIdle);

      return await this.discordService.playAudio(input, ttsStream, undefined, ttsPlayer);
    } catch (error) {
      logger.error(`Error in speechStream: ${error.message}`);
    }
  }

  public getGuildData(guildId: string, guildName?: string): GuildData{
    let guildData = this._guildDataList.find(l => l.guildId == guildId);
    if(!guildData){
      guildData = {
        guildId: guildId,
        songsQueue: [],
        guildConfig: guildConfigurationManager.getGuildConfig(guildId, guildName),
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

  get musicService(): MusicService {
    return this._musicService;
  }

}

const Roboto = new RobotoClass();
export default Roboto;

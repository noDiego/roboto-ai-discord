import { AttachmentBuilder, EmbedBuilder, GuildTextBasedChannel, Interaction, Message } from 'discord.js';
import { commands } from './commands';
import { GuildData, MusicProvider, SongInfo } from './interfaces/guild-data';
import { BotInput, MusicAction } from './interfaces/discord-interfaces';
import { OpenAIService } from './services/openai-service';
import { AnthropicService } from './services/anthropic-service';
import { DeepSeekService } from './services/deepseek-service';
import { ChatService } from './services/chat-service';
import {
  bufferToStream,
  cleanMessage,
  downloadMp3, formatLyrics,
  getAudioStream,
  imageToBase64,
  musicControlAction, parseIfJson,
  replyLongMessage, sendLongMessageToChannel,
  sleep
} from './utils';
import logger from './logger';
import { msgToAI } from './ai-message-handling';
import { DiscordService } from './services/discord-service';
import { MusicService } from './services/music-service';
import i18n from './locales';
import { CONFIG } from "./config";
import { AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";
import { guildConfigurationManager } from "./config/guild-configurations";
import { ElevenLabsService } from "./services/eleven-service";
import { CorvoService, normalizeQuery } from "./services/corvo-service";
import { songService } from "./services/suno-service";
import { useAPIService } from "./services/useapi-service";
import path from "node:path";
import { ActionResult } from "./interfaces/action-result";
import { SunoDataItem } from "./interfaces/sunoapi/suno-response";
import fs from "node:fs";
import TavilySvc from './services/tavily-service';
import PerplexitySvc from "./services/perplexity_search";

class RobotoClass{

  private _guildDataList: GuildData[] = [];
  private _chatService: ChatService;
  private _openAIService: OpenAIService | undefined;
  private _musicService: MusicService;
  private _discordService: DiscordService;
  private _elevenLabsService: ElevenLabsService;

  constructor() {
    switch (CONFIG.aiProvider) {
      case 'OPENAI': {
        const openAIService = new OpenAIService();
        this._chatService = openAIService;
        this._openAIService = openAIService;
        break;
      }
      case 'ANTHROPIC':
        this._chatService = new AnthropicService();
        break;
      case 'DEEPSEEK':
        this._chatService = new DeepSeekService();
        break;
      default: {
        const exhaustive: never = CONFIG.aiProvider;
        throw new Error(`Unsupported AI provider "${exhaustive}".`);
      }
    }
    logger.info(`[Roboto] AI Provider: ${CONFIG.aiProvider}`);
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
        await interaction.deferReply();
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

      const botResponseMsg = await msgToAI(message, guildData, null, this.chatService.hasChatCache(message.guildId+message.channelId));
      if(!botResponseMsg) return;

      return await replyLongMessage(repliedMsg, botResponseMsg.message, true);

    }catch (e){
      logger.error(e.message);
      return message.reply({content: 'Tuve un Error, avisenle a Jiro ):'});
    }finally {
      guildData.isBusy = false;
    }
  }

  public async addAndPlaySongs(songs: SongInfo[], inputData: BotInput, extraDescription?: string): Promise<string> {
    const addResult = await this._musicService.addToQueue(inputData, songs);

    let functionResult = '';

    if (addResult.success && addResult.code === 10) {
      return `Added to the queue: "${songs[0].title}"` + (songs.length > 1 ? ` and ${songs.length - 1} more songs.` : ``);
    }

    if (addResult.success && addResult.code === 11) {
      functionResult = `Added to the queue: "${songs[0].title}"` + (songs.length > 1 ? ` and ${songs.length - 1} more songs. ` : ``);
    }

    if (!addResult.success) return `Error adding songs to queue`;

    const playResult = await this._musicService.startPlayback(inputData);

    if (playResult.success) {
      let msg = `${functionResult}Playing: "${songs[0].title}".`;
      if (extraDescription) msg += ` ${extraDescription}`;
      return msg.trim();
    } else {
      return `Error playing: "${songs[0].title}". ${playResult.error}`;
    }
  }

  public async executeFunctions(functionName: string, functionArgs: any, inputData: BotInput): Promise<string>{
    const args = parseIfJson(functionArgs);
    logger.info(`[Assistant->handleFunction] Executing function: ${functionName} with args: ${JSON.stringify(args)}`);
    const handlers: Record<string, (args: any, inputData: BotInput) => Promise<string>> = {

      search_youtube: async (args) => {
        const searchResult = await this._musicService.search(args.query, MusicProvider.YOUTUBE, args.maxResults);
        if (!searchResult.success)
          return `No song was found on YouTube that matches: "${args.query}".`;
        return `Song Object Results: ${JSON.stringify(searchResult.data)}`;
      },

      web_search: async (args) => {
        try{
        const searchResult = await PerplexitySvc.perplexitySonarSearch(args.query, args.user_location);
        return JSON.stringify(searchResult);
        }catch (e){
          return `Error searching web: ${e}`;
        }
      },
      play_youtube_songs: async (args, inputData) => {
        return this.addAndPlaySongs(args.songs, inputData);
      },
      play_mp3: async (args, inputData) => {
        const searchResult = await this._musicService.search(args.query, MusicProvider.MP3);
        if(!searchResult.success || !searchResult.data.length) return `No mp3 file was found that matches: "${args.query}".`;
        return this.addAndPlaySongs(searchResult.data, inputData);
      },
      play_corvo_song: async (args, inputData) => {
        const searchResult = await this._musicService.search(args.title, MusicProvider.CORVO);
        if(!searchResult.success || !searchResult.data.length) return `No mp3 file was found that matches: "${args.title}".`;

        const songDescription = CorvoService.corvoSongs.find(c => c.song_name.includes(searchResult.data[0].title))?.song_description ?? '';

        return this.addAndPlaySongs(searchResult.data, inputData, `Description: "${songDescription}"`);
      },
      get_corvo_songs_details: async (args, inputData) => {
        const queryNormalized = args.query_cs ? normalizeQuery(args.query_cs) : null;
        const corvoResultList = queryNormalized
            ? CorvoService.corvoSongs.filter(c =>
                normalizeQuery(c.song_name).includes(queryNormalized) ||
                normalizeQuery(c.song_description).includes(queryNormalized)
            )
            : CorvoService.corvoSongs;
        const finalList = corvoResultList.map(c => ({
          title: c.song_name,
          description: c.song_description
        }));
        return JSON.stringify(finalList);
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
        await this.speakTextStream(inputData, input, instructions, voice);
        return `The audio message was generated successfully. Now, you should respond using this message so that the user can also read it: "${input.replace(/\[.*?\]\s*/g, '')}"`;
      },

      generate_song: async (args, inputData) => {
        const {title, lyrics, styles} = args;

        const lyricData = {title, lyrics};
        lyricData.lyrics = lyricData.lyrics.replace(/\(([^)]+)\)/g, '[$1]');
        let filteredStyles = Array.isArray(styles) ? styles.join(`, `): styles;

        this.createSunoSong(filteredStyles, lyricData, inputData);

        return `La canción titulada "${lyricData.title}" esta en proceso de creación. Pidele al usuario que espere 1 minuto.`;
      },

      create_image: async (args) => {
        const guildData = this.getGuildData(inputData.guildId);
        if (!guildData.guildConfig.imageCreationEnabled) return `The image creation is disabled.`

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
          await channel.send({files: [attachment]});

          return 'Image sent successfully.';
        } catch (e) {
          logger.error(e.message);
          return `Error creating image: "${e.message}"`;
        }
      },

      edit_image: async (args) => {
        const guildData = this.getGuildData(inputData.guildId);
        if (!guildData.guildConfig.imageCreationEnabled) return `The image creation is disabled.`

        logger.info(`Editing image for prompt "${JSON.stringify(args.prompt)}"`)

        const channel = inputData.channel as GuildTextBasedChannel;

        const imageStreams = await Promise.all(
            args.imageIds.map(async (imageId: string) => {

              logger.debug(`[createImage] imgId=${imageId}`);

              if (imageId.startsWith("LOCAL-")) {
                const filename = imageId.replace("LOCAL-", "") + ".jpg";
                const filePath = path.join(__dirname, '/../assets/images/', filename);
                logger.debug(`[createImage] filePath=${filePath}`);
                if (!fs.existsSync(filePath)) throw new Error(`No se encontró ningún archivo local con filename=${filename}`);
                return fs.createReadStream(filePath);
              }

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
          await channel.send({files: [attachment]});

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
      const cleanedMsg = cleanMessage(msgToSay);
      logger.debug(`Text to pronounce: ${cleanedMsg}`);
      const ttsStream = ttsProvider == 'OPENAI' ? await this.openAI.speechStream(cleanedMsg, instructions, voice) :
          await this._elevenLabsService.ttsStream(msgToSay, voice ?? 'cain');
      await sleep(1500);
      return await this.pauseAndPlay(input, ttsStream);
    } catch (error) {
      logger.error(`Error in speechStream: ${error.message}`);
    }
  }

  public async pauseAndPlay(input: BotInput | Message<boolean>, source: any) {
    const connection = await this.discordService.getGuildVoiceConnection(input);
    const musicPlayer = await this.discordService.getAudioPlayer(input);
    const wasPlaying = musicPlayer.state.status === AudioPlayerStatus.Playing;

    const ttsPlayer = createAudioPlayer();

    connection.subscribe(ttsPlayer);

    if (wasPlaying) musicPlayer.pause();

    const onTtsIdle = (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle) {
        connection.subscribe(musicPlayer);
        if (wasPlaying) musicPlayer.unpause();
        ttsPlayer.removeListener('stateChange', onTtsIdle);
        ttsPlayer.stop();
      }
    };
    ttsPlayer.on('stateChange', onTtsIdle);

    return await this.discordService.playAudio(input, source, undefined, ttsPlayer);
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

  public async createSunoSong(styles: string, lyricData: any, inputData: BotInput) {
    // Stream Process
    const mp3Folder = CONFIG.mp3Folder;
    const channel = inputData.channel as GuildTextBasedChannel;
    const taskId = await songService.startMusicGeneration(styles, lyricData, false);

    const streamResult = await songService.waitSongsStream(taskId) as ActionResult<SunoDataItem[]>;

    if(!streamResult.success){
      logger.error(`Error creating stream: ${streamResult.error}`);
      return channel.send(`Error creando la cancion: ${streamResult.error}`);
    }

    logger.info(`Reproduciendo canción creada ${streamResult.data[0].title}`);

    await sendLongMessageToChannel(channel,`**${streamResult.data[0].title}**\n\nLetra:\n\n${formatLyrics(streamResult.data[0].prompt)}`);

    Roboto.addAndPlaySongs([{
      provider: MusicProvider.MP3,
      title: streamResult.data[0].title,
      url: streamResult.data[0].streamAudioUrl,
      thumbnail: streamResult.data[0].imageUrl,
      duration: String(streamResult.data[0].duration)
     }], inputData);

    // MP3 Process
    const mp3ResultData = await songService.waitSongsMP3(taskId);
    if (!mp3ResultData.success || (!mp3ResultData.data[0].audioUrl && !mp3ResultData.data[1].audioUrl)) {
      logger.error('No se pudo generar los archivos MP3.');
      return false;
    }

    const path1 = path.join(mp3Folder, `${mp3ResultData.data[0].title}.mp3`);
    const path2 = path.join(mp3Folder, `${mp3ResultData.data[0].title} v2.mp3`);
    const mp3URL1 = mp3ResultData.data[0].audioUrl;
    const mp3URL2 = mp3ResultData.data[1].audioUrl;

    if (mp3URL1) downloadMp3(mp3URL1, path1);
    if (mp3URL2) downloadMp3(mp3URL2, path2);

    let desc = '';
    if (mp3URL1) desc += `- ${mp3ResultData.data[0].title}\n`;
    if (mp3URL2) desc += `- ${mp3ResultData.data[0].title} v2`;

    const msgEmbd = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Cancioncitas creadas:')
        .setDescription(desc);

    return desc? await channel.send({embeds: [msgEmbd]}) : null;
  }

  private async createMurekaSong(styles, lyricData: any, inputData: BotInput ){
    const channel = inputData.channel as GuildTextBasedChannel;
    const mp3Folder = CONFIG.mp3Folder;

    const songResponse = await useAPIService.generateSongStream({
      lyrics: lyricData.lyrics,
      title: lyricData.title,
      desc: styles?.join(', '),
      model: 'V6'
    })

    this.pauseAndPlay(inputData, songResponse.data);

    const path1 = path.join(mp3Folder, `${lyricData.title}_1.mp3`);
    const path2 = path.join(mp3Folder, `${lyricData.title}_2.mp3`);

    const dl1 = downloadMp3(songResponse.urls[0], path1);
    const dl2 = downloadMp3(songResponse.urls[1], path2);

    await Promise.all([dl1, dl2]);

    const msgEmbd = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Cancioncitas creadas:')
        .setDescription(`- ${lyricData.title}_1\n- ${lyricData.title}_2`);

    await channel.send(`**${lyricData.title}**\n\nLetra:\n${lyricData.lyrics}`);
    return await channel.send({embeds:[msgEmbd]});
    //channel.send({content: lyricData.lyrics, files: [attachment, attachment2]});
  }

  get chatService(): ChatService {
    return this._chatService;
  }

  get openAI(): OpenAIService {
    if (!this._openAIService) {
      if (!CONFIG.OPENAI.apiKey) {
        throw new Error('OPENAI_API_KEY is not set. OpenAI capabilities (image generation/editing, TTS, lyrics) are unavailable with the current chat provider. Set OPENAI_API_KEY to enable them.');
      }
      this._openAIService = new OpenAIService();
    }
    return this._openAIService;
  }

  get discordService(): DiscordService {
    return this._discordService;
  }

  get musicService(): MusicService {
    return this._musicService;
  }

  get elevenLabs(): ElevenLabsService {
    return this._elevenLabsService;
  }

}

const Roboto = new RobotoClass();
export default Roboto;

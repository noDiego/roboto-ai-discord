import {Guild, GuildMember} from 'discord.js';
import {
  createAudioPlayer,
  createAudioResource,
  DiscordGatewayAdapterCreator,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus
} from '@discordjs/voice';
import logger from '../logger';
import {GuildPlayer} from '../interfaces/guild-data';
import {BotInput} from '../interfaces/discord-interfaces';

export class DiscordService {

  private guildPlayers = new Map<string, GuildPlayer>();

  private readonly timeoutMinutes = 60;

  constructor() {
    setInterval(() => this.timeoutVoice(), this.timeoutMinutes * 60 * 1000);
    logger.info('DiscordService iniciado correctamente.');
  }

  async playAudio(input: BotInput, stream: any, type?: StreamType): Promise<void> {
    const audioPlayer = await this.getAudioPlayer(input);
    const resource = createAudioResource(stream, {
      inputType: type ?? stream?.type
    });
    audioPlayer.play(resource);
  }

  async getAudioPlayer(input: BotInput){
    const guildAudioPlayer = await this.getGuildAudioplayer(input);
    return guildAudioPlayer.audioPlayer;
  }

  private async getGuildAudioplayer(input: BotInput): Promise<GuildPlayer> {
    const guild: Guild | null = input.guild;
    if (!guild) {
      throw new Error('No se pudo identificar el servidor.');
    }
    let guildPlayer = this.guildPlayers.get(guild.id);
    if (!guildPlayer) {
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
      });

      player.on('stateChange', (oldState, newState) => {
        if (oldState.status === 'playing') {
          const gp = this.guildPlayers.get(guild.id);
          if (gp) gp.lastActivityTime = Date.now();
        }
      });
      player.on('error', error => {
        logger.error(`Error en el reproductor: ${error.message} (metadata: ${error.resource?.metadata})`);
      });

      const voiceConnection = await this.getGuildVoiceConnection(input);
      voiceConnection.subscribe(player);

      guildPlayer = { guildId: guild.id, audioPlayer: player, lastActivityTime: Date.now() };
      this.guildPlayers.set(guild.id, guildPlayer);
    } else {
      guildPlayer.lastActivityTime = Date.now();
    }
    return guildPlayer;
  }

  private async getGuildVoiceConnection(input: BotInput): Promise<VoiceConnection> {
    const guild: Guild | null = input.guild;
    if (!guild) {
      throw new Error('No se pudo identificar el servidor.');
    }
    const member = input.member as GuildMember;
    const voiceChannelId = member.voice.channelId || await this.getMostPopVoiceChannel(guild);

    // Si existe una conexión activa y lista, la retornamos
    let connection = getVoiceConnection(guild.id);
    if (connection && connection.state.status === VoiceConnectionStatus.Ready) {
      return connection;
    }
    // Sino, se crea una nueva conexión
    connection = joinVoiceChannel({
      channelId: voiceChannelId!,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      selfMute: false,
      selfDeaf: false
    });

    connection.on('error', error => {
      logger.error('Error en la conexión de voz: ' + error.message);
    });

    return connection;
  }

  private timeoutVoice() {
    const now = Date.now();
    for (const [guildId, guildPlayer] of this.guildPlayers) {
      // Si el reproductor está reproduciendo, actualizamos la última actividad
      if (guildPlayer.audioPlayer.state.status === 'playing') {
        guildPlayer.lastActivityTime = now;
      }
      // Calculamos la inactividad y desconectamos si se supera el límite
      if (now - guildPlayer.lastActivityTime >= this.timeoutMinutes * 60 * 1000) {
        logger.debug(`Desconectando la guild ${guildId} por inactividad.`);
        const voiceConn = getVoiceConnection(guildId);
        if (voiceConn) {
          guildPlayer.audioPlayer.removeAllListeners();
          voiceConn.destroy();
          this.guildPlayers.delete(guildId);
        }
      }
    }
  }

  private async getMostPopVoiceChannel(guild: Guild): Promise<string | undefined> {
    try {
      const channels = await guild.channels.fetch();
      let maxMembers = -1;
      let channelId: string;
      for (const channel of channels.values()) {
        if (channel!.isVoiceBased()) {
          const count = channel.members.size;
          if (count > maxMembers) {
            maxMembers = count;
            channelId = channel.id;
          }
        }
      }
      return channelId!;
    } catch (error: any) {
      logger.error('Error al obtener el canal de voz: ' + error.message);
      return undefined;
    }
  }
}

import { Message } from 'discord.js';
import { AudioPlayer } from '@discordjs/voice';
import { GuildConfiguration } from "../config/guild-configurations";

export interface GuildData {
  guildId: string;
  songsQueue: SongInfo[];
  isBusy: boolean;
  guildConfig: GuildConfiguration;
  currentSongInfo?: SongInfo;
  currentMusicMsg?: Message<boolean>;
}

export interface SongInfo {
  provider: MusicProvider
  url?: string;
  title: string;
  duration?: string;
  thumbnail?: string;
}

export enum MusicProvider{
  YOUTUBE = 'YOUTUBE',
  CORVO = 'CORVO',
  MP3 = 'MP3'
}

export interface GuildPlayer{
  botId?: string;
  guildId: string;
  audioPlayer: AudioPlayer;
  lastActivityTime: number;
}

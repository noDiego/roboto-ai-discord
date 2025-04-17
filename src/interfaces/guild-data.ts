import { Message } from 'discord.js';
import { AudioPlayer } from '@discordjs/voice';

export interface GuildData {
  guildId: string;
  songsQueue: SongInfo[];
  isBusy: boolean;
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
  SOUNDCLOUD = 'SOUNDCLOUD',
  MP3 = 'MP3'
}

export interface GuildMessage{
  responseMessageId?: string;
  isImage: boolean;
  content: string;
  author: {
    bot: boolean;
    globalName?: string;
  };
  attachments?:{
    url: string;
    contentType: string;
  }
  createdTimestamp: number;
}

export interface GuildPlayer{
  botId?: string;
  guildId: string;
  audioPlayer: AudioPlayer;
  lastActivityTime: number;
}

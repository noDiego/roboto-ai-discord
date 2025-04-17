import { CommandInteraction, Message } from 'discord.js';

export type BotInput = CommandInteraction | Message<boolean>;

export enum MusicAction {
  STOP = 'music.stop',
  SKIP = 'music.skip',
  PAUSE = 'music.pause',
  RESUME = 'music.resume',
}

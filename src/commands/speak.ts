import { CommandInteraction, Message, SlashCommandBuilder } from "discord.js";
import { sleep, temporalMsg } from '../utils';
import logger from '../logger';
import { Readable } from 'stream';
import Roboto from "../roboto";

export enum CVoices {
  JIRO = 'MtkHkdD3cw8GUlrgMMuM',
  DARKAYSER = 'kSv7ExgVZm6PJMseGkKu',
  CHAINER = '170l9BgOYvdt9LkK6Bkg',
  CAIN = 'zq4MUhutQpQKs3OA6fgF',
  PINERA = 'nppBs8tfCJ2smgETSuOb',
  WENCHO = 'cNX4JVnC2gBtWgNynNSt',
  VALERIA = '9oPKasc15pfAbMr7N6Gs',
  SARAH = 'gD1IexrzCvsXPHUuT0s3', // Española
  DANDAN = '9F4C8ztpNUmXkdDDbz3J', // Española
  CAMILA = 'k8fyM7r8e13c8YeLhcrC',
}

export const data = new SlashCommandBuilder()
  .setName("sp")
  .setDescription("Pronuncia lo que escribas con la voz de alguien")
  .addStringOption(option =>
    option.setName('voz')
      .setDescription('Voces de: "Cain", "Pinera", "Darkayser", "Chainer", "Wencho" o "Jiro"')
      .setRequired(true).addChoices(
      { name: 'Cain', value: 'CAIN' },
      { name: 'Piñera', value: 'PINERA' },
      { name: 'Darkayser', value: 'DARKAYSER' },
      { name: 'Chainer', value: 'CHAINER'},
      { name: 'Wencho', value: 'WENCHO'},
      { name: 'Jiro', value: 'JIRO'}
    ))
  .addStringOption(option =>
    option.setName('texto')
      .setDescription('Texto a pronunciar')
      .setRequired(true));

export async function execute(interaction: CommandInteraction) {

  await interaction.deferReply();

  const voice = interaction.options.get('voz')!.value as string;
  let texto = interaction.options.get('texto')!.value as string;

  speakTextStream(interaction, texto, voice);

  const msg = await interaction.editReply({content: 'Reproduciendo...'});
  temporalMsg(msg, 5);
}

export async function speakTextStream(interaction: CommandInteraction, texto: string, voice: string){
  texto = cleanMessage(texto);
  logger.debug(`Texto a pronunciar: ${texto}`);
  const voiceID = CVoices[voice.toUpperCase()];

  const readableStream : Readable  = await Roboto.elevenLabs.ttsStream(texto, voiceID);
  return Roboto.pauseAndPlay(interaction, readableStream);
}

function cleanMessage(msg: string): string {
  return msg
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ ]{2,}/g, ' ')
      .trim();
}

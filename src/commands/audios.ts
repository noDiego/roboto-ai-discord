import { AutocompleteInteraction, CommandInteraction, EmbedBuilder, GuildMember, SlashCommandBuilder } from 'discord.js';
import logger from '../logger';
import fs, { readFileSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import Roboto from "../roboto";
import { temporalMsg } from "../utils";

const audiosFolder = __dirname + "/../../assets/audios/";

export const data = new SlashCommandBuilder()
  .setName('a')
  .setDescription("Reproduce los audios random de corvotim")
  .addStringOption(option =>
    option.setName('nombre')
      .setDescription('Nombre del audio')
      .setRequired(false)
      .setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction){
  const texto = interaction.options.get('nombre')!.value as string;
  const sugerencias = listaAudios().filter(m => m.toLowerCase().includes(texto.toLowerCase()));
  return interaction.respond(sugerencias.slice(0,24).map(m => ({name: m, value: m})));
}

export async function execute(interaction: any) {

  const nombre = interaction.options.getString('nombre');

  if (!nombre){
    const mp3List = listaMp3();
    interaction.reply({ embeds: [mp3List], flags: 'Ephemeral' });
    return;
  }

  try {
    playMp3(interaction, String(nombre));

    const msgEmbd = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Escuchando: '+nombre)
      .setAuthor({name: 'Audios'});

    const reply = await interaction.reply({embeds:[msgEmbd]});
    temporalMsg(reply,2);
  }catch (e){
    logger.error(e);
  }
}

export async function playMp3(interaction: CommandInteraction, nombre: string) {
  const pathNormalized = path.normalize(audiosFolder + nombre + ".mp3");
  try {
    const readedFile = readFileSync(pathNormalized);
    const readableFile = Readable.from(readedFile);

    await Roboto.pauseAndPlay(interaction, readableFile);
    logger.info("Playing Audio: " + pathNormalized);
  } catch (e:any) {
    logger.error(`Error con audio "${nombre}": ${e.message} `);
    const msg = await interaction.reply(`No hay audios con el nombre "${nombre}"`);
  }
}

function listaMp3(){

  let msgAudios = '/a ';
  let msgEmbd;

  const folder = fs.readdirSync(audiosFolder);

  for (let i = 0; i < folder.length; i++){
    const file = folder[i];
    msgAudios = msgAudios + file.replace('.mp3', '') + ((i + 1) == folder.length ? "" : "\n/a ")
  }

  msgEmbd = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Lista de audios')
    .setDescription(msgAudios);

  return msgEmbd;
}

function listaAudios() {
  const lista: string[] = [];
  const folder = fs.readdirSync(audiosFolder);

  for (let i = 0; i < folder.length; i++){
    const item = folder[i];
    if(item.endsWith('.mp3')) lista.push(item.replace('.mp3', ''))
  }

  return lista;
}

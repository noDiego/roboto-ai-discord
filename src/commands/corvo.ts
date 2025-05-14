import { AutocompleteInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import { msgToAI } from "../ai-message-handling";
import fs from "fs";

export const data = new SlashCommandBuilder()
  .setName("corvo")
  .setDescription("Reproduce musicones de Corvotim")
  .addStringOption(option =>
    option.setName('titulo')
      .setDescription('Nombre del temazo')
      .setRequired(true)
      .setAutocomplete(true));

const corvoMusicList = corvoList();

export async function autocomplete(interaction: AutocompleteInteraction){
  const texto = interaction.options.getString('titulo');
  const sugerencias = corvoMusicList.filter(m => m.toLowerCase().includes(texto.toLowerCase()));
  return interaction.respond(sugerencias.slice(0,24).map(m => ({name: m, value: m})));
}

export async function execute(interaction: any) {
  const title = interaction.options.getString('titulo');
  interaction.deferReply();

  const guild = interaction.guild;

  const botResponseMsg = await msgToAI(interaction, Roboto.getGuildData(guild.id), `Pon la cancion de Corvo llamada "${title}"`);
  if (!botResponseMsg) return;

  return interaction.editReply(botResponseMsg.message);
}

function corvoList(): string[]{
  const corvoFolder = __dirname + "/../../assets/corvo/";
  const files = fs.readdirSync(corvoFolder);
  const list: string[] = [];
  for (const file of files) {
    if(file.endsWith(".mp3"))
      list.push(file.replace(".mp3", ""));
  }
  return list;
}
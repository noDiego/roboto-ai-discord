import { AutocompleteInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import { msgToAI } from "../ai-message-handling";
import fs from "fs";
import path from "node:path";

export const data = new SlashCommandBuilder()
  .setName("corvo")
  .setDescription("Reproduce musicones de Corvotim")
  .addStringOption(option =>
    option.setName('titulo')
      .setDescription('Nombre del temazo')
      .setRequired(true)
      .setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction){
  const texto = interaction.options.getString('titulo');
  const sugerencias = corvoList().filter(m => m.toLowerCase().includes(texto.toLowerCase()));
  return interaction.respond(sugerencias.slice(0,24).map(m => ({name: m, value: m})));
}

export async function execute(interaction: any) {
  const title = interaction.options.getString('titulo');
  interaction.deferReply();

  const guild = interaction.guild;

  const botResponseMsg = await msgToAI(interaction, Roboto.getGuildData(guild.id), `Pon la cancion de Corvo llamada "${title}"`, true);
  if (!botResponseMsg) return;

  return interaction.editReply(botResponseMsg.message);
}

function corvoList(): string[] {
  const corvoFolder = path.join(__dirname, "../../assets/corvo/");
  const files = fs.readdirSync(corvoFolder);
  const mp3Files = files.filter(file => file.endsWith(".mp3"));

  const filesWithDates = mp3Files.map(file => {
    const fullPath = path.join(corvoFolder, file);
    const stats = fs.statSync(fullPath);
    return {
      name: file.replace(".mp3", ""),
      mtime: stats.mtime
    };
  });

  // filesWithDates.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  filesWithDates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return filesWithDates.map(f => f.name);
}
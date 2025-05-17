import { AutocompleteInteraction, SlashCommandBuilder } from "discord.js";
import fs from 'fs';
import path from 'path';
import Roboto from "../roboto";
import { CONFIG } from "../config";
import { MusicProvider } from "../interfaces/guild-data";

const mp3Folder = CONFIG.mp3Folder;

export const data = new SlashCommandBuilder()
    .setName("corvo2")
    .setDescription("Reproduce musicones de Corvotim!")
    .addStringOption(option =>
        option.setName('titulo')
            .setDescription('Nombre del temazo')
            .setRequired(true)
            .setAutocomplete(true));

export async function autocomplete(interaction: AutocompleteInteraction){
    const texto = interaction.options.get('titulo')!.value as string;
    const sugerencias = corvoList().filter(m => m.toLowerCase().includes(texto.toLowerCase()));
    return interaction.respond(sugerencias.slice(0,24).map(m => ({name: m, value: m})));
}

export async function execute(interaction: any) {

    await interaction.deferReply();

    const titulo = interaction.options.getString('titulo');

    await Roboto.addAndPlaySongs([{
        provider: MusicProvider.MP3,
        title: titulo
    }], interaction);

    return interaction.editReply(`Agregada la cancion "${titulo}"!`);
}

function corvoList(): string[] {
    const files = fs.readdirSync(mp3Folder)
        .filter(file => file.endsWith(".mp3"))
        .map(file => {
            const filePath = path.join(mp3Folder, file);
            const stats = fs.statSync(filePath);
            return {
                name: file.replace(".mp3", ""),
                time: stats.mtime.getTime()
            };
        })
        .sort((a, b) => b.time - a.time)
        .map(f => f.name);

    return files;
}


import { AutocompleteInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";
import { msgToAI } from "../ai-message-handling";
import fs from "fs";
import path from "node:path";
import { recognition } from "../custom";
import { songService } from "../services/suno-service";
import { BotInput } from "../interfaces/discord-interfaces";

export const data = new SlashCommandBuilder()
    .setName("song")
    .setDescription("Reproduce musicones de Corvotim")
    .addStringOption(option =>
        option.setName('prompt-letra')
            .setDescription('Prompt para crear la letra. O la letra completa')
            .setRequired(true))

    .addStringOption(option =>
        option.setName('styles')
            .setDescription('Generos musicales (separados por coma) (Opcional)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('titulo')
            .setDescription('Titulo de la Canción (Opcional: la IA puede asignarle un titulo)')
            .setRequired(false))
;

export async function execute(interaction: any) {

    await interaction.deferReply();

    const prompt = interaction.options.getString('prompt-letra');
    const styles = interaction.options.getString('styles');
    let title = interaction.options.getString('titulo');
    let lyrics = '';


    const validateLyrics = await areLyrics(prompt);

    if (!validateLyrics) {
        const generatedSong = JSON.parse(await Roboto.openAI.lyricSongGeneration(prompt, title));
        lyrics = generatedSong.lyrics;
        title = title || generatedSong.title;
    } else
        lyrics = prompt;

    lyrics = lyrics.replace(/\(([^)]+)\)/g, '[$1]');

    Roboto.createSunoSong(styles, {title, lyrics}, interaction);

    return interaction.editReply('Estoy generando la canción. Dame un minuto...');
}

async function areLyrics(prompt: string) {

    const recognitionMsgs = structuredClone(recognition);
    recognitionMsgs.push({
        role: "user",
        content: [
            {
                type: "input_text",
                text: prompt
            }
        ]
    })

    const result = await Roboto.openAI.customMsg(recognitionMsgs, {max_output_tokens: 16});
    return result == 'l';
}
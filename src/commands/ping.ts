import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription('Ping');


export async function execute(inputData: CommandInteraction) {

    // Roboto.createSunoSong('lo-fi', 'test',inputData);

    return inputData.reply('OK');
}


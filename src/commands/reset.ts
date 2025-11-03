import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import Roboto from "../roboto";

export const data = new SlashCommandBuilder()
    .setName("reset")
    .setDescription('Reset chat context');


export async function execute(inputData: CommandInteraction) {
    Roboto.openAI.deleteChatCache(inputData.guildId);
    await inputData.deleteReply();
    return await inputData.followUp({content: 'Chat Reset successfully', flags: 'Ephemeral'});
}


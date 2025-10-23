import { CommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription('Ping');


export async function execute(inputData: CommandInteraction) {

    await inputData.deferReply({ephemeral: true});

    setTimeout(() => {
        inputData.deleteReply();
        inputData.followUp({
            content: "public message",
            ephemeral: false
        })
    }, 3000)
}


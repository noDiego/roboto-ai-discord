import { Collection, CommandInteraction, Message, SlashCommandBuilder, Snowflake } from "discord.js";
import Roboto from "../roboto";
import { lastProcessed } from "../ai-message-handling";

export const data = new SlashCommandBuilder()
    .setName("reset")
    .setDescription('Reset chat context');


export async function execute(inputData: CommandInteraction) {
    Roboto.openAI.deleteChatCache(inputData.guildId+inputData.channelId);
    await inputData.deleteReply();


    const channelMessagesCollection: Collection<string, Message<boolean>> = await inputData.channel.messages.fetch({limit: 1}) as Collection<Snowflake, Message<boolean>>;
    let channelMessages = Array.from(channelMessagesCollection.values());

    lastProcessed.set(inputData.guildId+inputData.channelId, channelMessages[0].id);

    return await inputData.followUp({content: 'Chat Reset successfully', flags: 'Ephemeral'});
}


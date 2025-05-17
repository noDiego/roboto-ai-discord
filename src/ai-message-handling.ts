import { Collection, CommandInteraction, Message, Snowflake, TextBasedChannel } from 'discord.js';
import { CONFIG, generateAIPrompt } from './config';
import { AIAnswer, AIContent, AiMessage, AIProvider, AIRole } from './interfaces/ai-interfaces';
import Roboto from './roboto';
import { AITools } from './services/functions';
import { BotInput } from './interfaces/discord-interfaces';
import { extractJSON, getUnsupportedMessage, getUserName } from './utils';
import { ResponseInput } from "openai/src/resources/responses/responses";
import { GuildData } from "./interfaces/guild-data";

export async function msgToAI(inputData: CommandInteraction | Message<boolean>, guildData: GuildData, commandMessage?: string, omitPreviousMsgs = false): Promise<AIAnswer> {

  // Build the message array to send to AI
  const messageList = await buildMessageArray(inputData, guildData, commandMessage, omitPreviousMsgs);

  // Convert messages to OPENAI format
  const convertedMsgList = convertIaMessagesLang(messageList, AIProvider.OPENAI, generateAIPrompt(guildData.guildConfig));

  // Send message to OPENAI and return response
  const answerJSON = await Roboto.openAI.sendChatWithTools(convertedMsgList, 'text', inputData, AITools);
  if(!answerJSON) return null;

  return extractJSON(answerJSON) as AIAnswer;
}

async function buildMessageArray(inputData: BotInput, guildData: GuildData, commandMessage?: string, omitPreviousMsgs = false): Promise<AiMessage[]>{

  const resetCommands: string[] = ["-reset", "-r", "/reset"];
  const channel : TextBasedChannel = inputData.channel as TextBasedChannel;

  /**Initialize messages array*/
  let messageList: AiMessage[] = [];

  /**If Omit enabled**/
  if(omitPreviousMsgs){
    const channelMessagesCollection: Collection<string, Message<boolean>> = await channel.messages.fetch({limit: 1}) as Collection<Snowflake, Message<boolean>>;
    messageList.push({role: AIRole.USER, content: [{ type: 'text', value: commandMessage ?? channelMessagesCollection[0].content }], name: getUserName(inputData)});
    return messageList;
  }

  /**Get list of messages in channel **/
  const channelMessagesCollection: Collection<string, Message<boolean>> = await channel.messages.fetch({limit: guildData.guildConfig.maxMessages}) as Collection<Snowflake, Message<boolean>>;
  let channelMessages = Array.from(channelMessagesCollection.values()).reverse();

  /**Consider only messages after -reset command**/
  const resetIndex = channelMessages.map(msg => msg.content).reduce((lastIndex, currentBody, currentIndex) => {
    return resetCommands.includes(currentBody) ? currentIndex : lastIndex;
  }, -1);
  channelMessages = resetIndex >= 0 ? channelMessages.slice(resetIndex + 1) : channelMessages;


  /**Organize messages to match AI expected structure**/
  for(const channelMsg of channelMessages.reverse()){

    const attachment = channelMsg.attachments.first();
    const isImage = attachment && attachment.contentType?.includes('image');

    if((channelMsg.content == '') && !isImage) continue;

    const rol = (!channelMsg.author.bot || isImage) ? AIRole.USER : AIRole.ASSISTANT;
    const name = getUserName(channelMsg);

    const content: Array<AIContent> = [];
    if(isImage) content.push({type: 'image',  value: attachment.url, media_type: <string> attachment.contentType, image_id: channelMsg.id});
    if(channelMsg.content.length > 0) content.push({ type: 'text', value: channelMsg.content });
    if(content.length == 0) continue;

    messageList.push({role: rol, content: content, name: name});
  }

  messageList = messageList.reverse();

  if (messageList.length > 1 && messageList[messageList.length - 1].role === AIRole.ASSISTANT) messageList.pop();

  if (commandMessage){
    messageList.push({role: AIRole.USER, content: [{ type: 'text', value: commandMessage }], name: getUserName(inputData)});
  }

  return messageList;
}

function convertIaMessagesLang(messageList: AiMessage[], lang: AIProvider, systemPrompt: string): ResponseInput{
  switch (lang){
    case AIProvider.OPENAI:
      const chatgptMessageList: ResponseInput = [];
      messageList.forEach(msg => {
        const gptContent: Array<any> = [];
        msg.content.forEach(c => {
          const msgContent = c.value?.replace(`<@${CONFIG.botClientID}>`,CONFIG.botName);
          const fromBot = msg.role == AIRole.ASSISTANT;
          if (['text', 'audio'].includes(c.type))  gptContent.push({
            type: fromBot?'output_text':'input_text',
            text: JSON.stringify({message: msgContent, author: msg.name, type: c.type, imageId: c.image_id, response_format:'json_object'}) });
          if (['image'].includes(c.type)){
            gptContent.push({ type: 'input_image', image_url: c.value });
            gptContent.push({
              type: fromBot ? 'output_text' : 'input_text',
              text: JSON.stringify({
                image_id: c.image_id,
                author: msg.name,
                note: 'refer to this image by its image_id'
              })
            });
          }
        })
        chatgptMessageList.push({content: gptContent, role: msg.role});
      })

      chatgptMessageList.unshift({role: AIRole.SYSTEM, content: systemPrompt});
      return chatgptMessageList;

    case AIProvider.DEEPINFRA: //Unused
      const otherMsgList: ResponseInput = [];
      messageList.forEach(msg => {
        const fromBot = msg.role == AIRole.ASSISTANT;
        if(fromBot) {
          const textContent = msg.content.find(c => c.type === 'text')!;
          const content = JSON.stringify({message: textContent.value, author: msg.name, type: textContent.type, response_format: "json_object"});
          otherMsgList.push({content: content, role: msg.role});
        }
        else {
          const gptContent: Array<any> = [];
          msg.content.forEach(c => {
            const msgContent = c.value?.replace(`<@${CONFIG.botClientID}>`,CONFIG.botName);
            if (['image'].includes(c.type)) gptContent.push({type: 'input_text', text: JSON.stringify({message: getUnsupportedMessage('image', ''), author: msg.name, type: c.type, response_format: "json_object"})});
            if (['text', 'audio'].includes(c.type)) gptContent.push({type: 'input_text', text: JSON.stringify({message: msgContent, author: msg.name, type: c.type, response_format: "json_object"})});
          })
          otherMsgList.push({content: gptContent, role: msg.role});
        }
      })

      otherMsgList.unshift({role: AIRole.SYSTEM, content: systemPrompt});

      return otherMsgList;

    default:
      return [];
  }
}

import {Collection, CommandInteraction, Message, Snowflake, TextBasedChannel} from 'discord.js';
import {CONFIG} from './config';
import {AIAnswer, AIContent, AiMessage, AIProvider, AIRole} from './interfaces/ai-interfaces';
import Roboto from './roboto';
import {AITools} from './services/functions';
import {BotInput} from './interfaces/discord-interfaces';
import {extractJSON, getUnsupportedMessage, getUserName} from './utils';
import {ResponseInput} from "openai/src/resources/responses/responses";

export async function msgToAI(inputData: CommandInteraction | Message<boolean>): Promise<AIAnswer> {

  // Build the message array to send to AI
  const messageList = await buildMessageArray(inputData);

  // Convert messages to OPENAI format
  const convertedMsgList = convertIaMessagesLang(messageList, AIProvider.OPENAI, CONFIG.AIConfig.prompt);

  // Send message to OPENAI and return response
  const answerJSON = await Roboto.openAI.sendChatWithTools(convertedMsgList, 'text', inputData, AITools);

  return extractJSON(answerJSON) as AIAnswer;
}

async function buildMessageArray(inputData: BotInput): Promise<AiMessage[]>{

  const resetCommands: string[] = ["-reset", "-r", "/reset"];

  /**Initialize messages array*/
  let messageList: AiMessage[] = [];

  /**Get list of messages in channel **/
  const channel : TextBasedChannel = inputData.channel as TextBasedChannel;
  const channelMessagesCollection: Collection<string, Message<boolean>> = await channel.messages.fetch({limit: CONFIG.AIConfig.maxMsgs}) as Collection<Snowflake, Message<boolean>>;
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

    const rol = channelMsg.author.bot ? AIRole.ASSISTANT : AIRole.USER;
    const name = getUserName(channelMsg);

    const content: Array<AIContent> = [];
    if(isImage) content.push({type: 'image',  value: attachment.url, media_type: <string> attachment.contentType});
    if(channelMsg.content.length > 0) content.push({ type: 'text', value: channelMsg.content });
    if(content.length == 0) continue;

    messageList.push({role: rol, content: content, name: name});
  }

  messageList = messageList.reverse();

  if (messageList.length > 1 && messageList[messageList.length - 1].role === AIRole.ASSISTANT) messageList.pop();

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
          if (['text', 'audio'].includes(c.type))  gptContent.push({ type: fromBot?'output_text':'input_text', text: JSON.stringify({message: msgContent, author: msg.name, type: c.type, response_format:'json_object'}) });
          if (['image'].includes(c.type))          gptContent.push({ type: 'input_image', image_url: c.value });
        })
        chatgptMessageList.push({content: gptContent, role: msg.role});
      })

      chatgptMessageList.unshift({role: AIRole.SYSTEM, content: systemPrompt});
      return chatgptMessageList;

    case AIProvider.DEEPINFRA:

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

import i18n from '../locales';
import {getLanguageName} from "../utils";
import { join } from 'path';

require('dotenv').config();


function generateAIPrompt(botName: string, botPrompt?: string): string {
  return `You are a friendly Discord bot, your name is ${botName}\n`+
  `- **Default Language**: Preferably all your answers will be in ${getLanguageName()}. Unless the user requests another language\n`+
  `- **Response Format**: All your responses must be in JSON format with the following structure:
  {
    "message": "<your response>",
    "author": "${botName}",
    "type": "<TEXT or VOICE>"
  }`+ `
  - **VOICE Messages**:  
  - You can send responses with your voice. Use "type": "VOICE" when responding with voice messages. Respond in the "message" field with what you are responding to, this will later be converted into audio for the user.
  - **Content for VOICE**: When using "type": "VOICE", your "message" field must contain the FULL content to be converted to speech, not just a confirmation. For example, if a user asks for a joke in audio or voice format, include the entire joke in the "message" field, not just "Here's a joke for you".
  - **Default Setting**: By default, your messages will be "TEXT" unless the user has specifically requested that you respond with voice.
  - **Summarize Voice**: All voice messages should be as brief and concise as possible.
  
  - **FUNCTIONS**:
  - When using functions, send only one function request, never send more than one.`+
  `${botPrompt?`- **The following is specific information for the group or individuals you are interacting with: "${botPrompt}"`:``}`
}

export const CONFIG = {
  appName: 'RobotoAI',
  botName: process.env.BOT_NAME!,
  botClientID: process.env.BOT_CLIENT_ID!,
  botToken: process.env.BOT_TOKEN!,
  locale: process.env.BOT_LOCALE || 'en',

  AIConfig:{
    chatProvider: process.env.AI_PROVIDER ?? 'OPENAI',
    speechProvider: process.env.AI_PROVIDER ?? 'OPENAI',
    imageProvider: process.env.AI_PROVIDER ?? 'OPENAI',
    prompt: generateAIPrompt(process.env.BOT_NAME!, process.env.BOT_PROMPT),
    maxMsgs: Number(process.env.AI_MAX_MSGS || 20)
  },
  AIParams:{
    OPENAI: {
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_BASEURL!,
      chatModel: process.env.OPENAI_CHAT_MODEL!,
      speechModel: process.env.OPENAI_SPEECH_MODEL!,
      speechVoice: process.env.OPENAI_SPEECH_VOICE ?? 'nova',
      imageModel: process.env.OPENAI_IMAGE_MODEL!,
    },
    DEEPINFRA: {
      apiKey: process.env.DEEPINFRA_API_KEY!,
      baseURL: process.env.DEEPINFRA_BASEURL!,
      chatModel: process.env.DEEPINFRA_CHAT_MODEL!,
      speechModel: process.env.DEEPINFRA_SPEECH_MODEL!,
      imageModel: process.env.DEEPINFRA_IMAGE_MODEL!
    },
  },
  Youtube: {
    tempDir: join(__dirname, '../../temp'),
    maxAgeMs: Number(process.env.YOUTUBE_MAX_AGEMS) || (4 * 60 * 60 * 1000) // 4 hours
  }
}


i18n.setLocale(CONFIG.locale);

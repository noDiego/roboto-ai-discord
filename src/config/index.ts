import i18n from '../locales';
import { getLanguageName } from "../utils";
import { join } from 'path';
import { GuildConfiguration } from "./guild-configurations";

require('dotenv').config();


export function generateAIPrompt(guildConfig: GuildConfiguration): string {
  return `You are a friendly and extroverted Discord bot. Your name is ${guildConfig.botName}\n and you are in a server called "${guildConfig.name}"`+
  `- The current date is ${new Date().toLocaleDateString()}. `+
  `- **Default Language**: Preferably all your answers will be in ${getLanguageName()}. Unless the user requests another language\n`+
  `- **Response Format**: All your responses must be in JSON format with the following structure:
  {
    "message": "<your response>",
    "author": "${guildConfig.botName}",
    "type": "<TEXT>"
  }`+
  `- **Voice Messages**:
   - By default, all your responses will use the common JSON/TEXT format, only if the user explicitly requests that you use your voice or generate audio will you respond using the "generate_speech" function
   
   - **Image Creation and Editing**:
   ${guildConfig.imageCreationEnabled?
      '- When you ask the model to generate or edit images of any persona, do NOT mention their names. Instead, refer to them as "the person in the first reference image" and "the person in the second reference image" (or similar), so that the API uses only the input images to know who they are.':
      '- Image creation has been disabled by the administrators'}
  `+
  `${guildConfig.promptInfo?`- **The following is specific information for the group or individuals you are interacting with: "${guildConfig.promptInfo}"`:``}`
}

export const CONFIG = {
  appName: 'RobotoAI',
  botName: process.env.BOT_NAME!,
  botClientID: process.env.BOT_CLIENT_ID!,
  botToken: process.env.BOT_TOKEN!,
  maxMessages: 30,
  defaultPrompt: process.env.BOT_PROMPT,
  locale: process.env.BOT_LOCALE || 'en',
  ttsProvider: (process.env.TTS_PROVIDER || 'OPENAI') as any,
  imageCreationEnabled: process.env.IMAGE_CREATION_ENABLED?.toLowerCase() == 'true',
  mp3Folder: __dirname + "/../../assets/mp3/",
  OPENAI: {
    apiKey: process.env.OPENAI_API_KEY!,
    chatModel: process.env.OPENAI_CHAT_MODEL! || 'gpt-4.1-mini',
    speechModel: process.env.OPENAI_SPEECH_MODEL! || 'gpt-4o-mini-tts',
    speechVoice: process.env.OPENAI_SPEECH_VOICE?.toLowerCase() ?? 'fable',
    imageModel: process.env.OPENAI_IMAGE_MODEL! || 'gpt-image-1',
    imageQuality: (process.env.OPENAI_IMAGE_QUALITY! || 'medium') as any
  },
  ELEVENLABS: {
    apiKey: process.env.ELEVENLABS_API_KEY!,
    speechModel: process.env.ELEVENLABS_SPEECH_MODEL! || 'eleven_multilingual_v2',
    speechVoice: process.env.ELEVENLABS_SPEECH_VOICEID! || 'N2lVS1w4EtoT3dr4eOWO'
  },
  SUNO:{
    baseURL: process.env.SUNO_BASE_URL || 'https://apibox.erweima.ai',
    apiKey: process.env.SUNOAPI_KEY!
  },
  USEAPI: {
    apiKey: process.env.USEAPI_API_KEY!
  },
  Youtube: {
    tempDir: join(__dirname, '../../temp'),
    maxAgeMs: Number(process.env.YOUTUBE_MAX_AGEMS) || (4 * 60 * 60 * 1000), // 4 hours
    cookies: process.env.YOUTUBE_COOKIES
  }
}


i18n.setLocale(CONFIG.locale);

import i18n from '../locales';
import { getLanguageName } from "../utils";
import { join } from 'path';
import { GuildConfiguration } from "./guild-configurations";
import { CommandInteraction, Message } from "discord.js";
import Roboto from "../roboto";

require('dotenv').config();


export function generateAIPrompt(guildConfig: GuildConfiguration, inputData: CommandInteraction | Message<boolean>): string {
  const connectedMembers = Roboto.discordService.getAllConnectedMembers(inputData.guild);

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
      `${CONFIG.aiProvider == 'ANTHROPIC'?'When citing sources from web searches, always use Discord-compatible inline Markdown link format: ([domain.com](<https://full-url.com>)). Never use XML citation tags or any other citation format. Place the citation naturally at the end of the sentence or claim it supports.':''}
      `
      +
  `
  - **${buildConnectedMembersString(connectedMembers)}
`+
  `
${guildConfig.promptInfo?`- **The following is specific information for the group or individuals you are interacting with: "${guildConfig.promptInfo}"`:``}`
}

function buildConnectedMembersString(connectedMembers: {name: string, channel: string}[]){
  if(connectedMembers?.length == 0) return ``;
  let result = `Currently connected members:`;
  connectedMembers.forEach((member) => {
    result = `${result}\n-${member.name} (Channel: ${member.channel})`;
  })
  return result;
}

export const CONFIG = {
  appName: 'RobotoAI',
  maxCycles: parseInt(process.env.MAX_COMMUNICATION_CYCLES ?? '6'),
  botName: process.env.BOT_NAME!,
  botClientID: process.env.BOT_CLIENT_ID!,
  botToken: process.env.BOT_TOKEN!,
  maxMessages: 30,
  defaultPrompt: process.env.BOT_PROMPT,
  locale: process.env.BOT_LOCALE || 'en',
  ttsProvider: (process.env.TTS_PROVIDER || 'OPENAI') as any,
  aiProvider: (process.env.AI_PROVIDER || 'OPENAI').toUpperCase() as 'OPENAI' | 'ANTHROPIC',
  imageCreationEnabled: process.env.IMAGE_CREATION_ENABLED?.toLowerCase() == 'true',
  mp3Folder: __dirname + "/../../assets/mp3/",
  SearchConfig:{
    enabled: process.env.WEB_SEARCH_ENABLED?.toLowerCase() === 'true',
    provider: process.env.SEARCH_PROVIDER?.toUpperCase() ?? 'TAVILY',
    tavilyApiKey: process.env.TAVILY_API_KEY,
    searchDepth: process.env.TAVILY_SEARCH_DEPTH ?? 'basic',
    maxResults: parseInt(process.env.TAVILY_MAX_RESULTS ?? '5'),
    includeAnswer: process.env.TAVILY_INCLUDE_ANSWER?.toLowerCase() === 'true',
    includeRawContent: process.env.TAVILY_INCLUDE_RAW_CONTENT?.toLowerCase() === 'true',
  },
  OPENAI: {
    apiKey: process.env.OPENAI_API_KEY!,
    chatModel: process.env.OPENAI_CHAT_MODEL! || 'gpt-4.1-mini',
    speechModel: process.env.OPENAI_SPEECH_MODEL! || 'gpt-4o-mini-tts',
    speechVoice: process.env.OPENAI_SPEECH_VOICE?.toLowerCase() ?? 'fable',
    imageModel: process.env.OPENAI_IMAGE_MODEL! || 'gpt-image-1',
    imageQuality: (process.env.OPENAI_IMAGE_QUALITY! || 'medium') as any,
    imageInputFidelity: (process.env.OPENAI_IMAGE_INPUT_FIDELITY! || 'low') as any
  },
  ANTHROPIC: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    chatModel: process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-4-6'
  },
  ELEVENLABS: {
    apiKey: process.env.ELEVENLABS_API_KEY!,
    speechModel: process.env.ELEVENLABS_SPEECH_MODEL! || 'eleven_multilingual_v2',
    speechVoice: process.env.ELEVENLABS_SPEECH_VOICEID! || 'N2lVS1w4EtoT3dr4eOWO'
  },
  PERPLEXITY:{
    apiKey: process.env.PERPLEXITY_API_KEY
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
    cookies: process.env.YOUTUBE_COOKIES,
    verbose: process.env.YOUTUBE_VERBOSE?.toLowerCase() === 'true'
  }
}


i18n.setLocale(CONFIG.locale);

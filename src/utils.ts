import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildTextBasedChannel,
  Interaction, InteractionEditReplyOptions, InteractionReplyOptions,
  Message, MessagePayload
} from 'discord.js';
import { BotInput, MusicAction } from './interfaces/discord-interfaces';
import { CONFIG } from "./config";
import logger from "./logger";
import i18n from "./locales";
import * as https from "node:https";
import { Readable } from "stream";
import path from "node:path";
import * as http from "node:http";
import fs from "fs";
import { AIAnswer, AiMessage, AIRole } from "./interfaces/ai-interfaces";

export function getFormattedDate(date?: Date, includeOffset = false) {
  const now = date || new Date();

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  const offsetMinutes = now.getTimezoneOffset();
  const offsetSign = offsetMinutes > 0 ? '-' : '+';
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffsetMinutes / 60).toString().padStart(2, '0');
  const offsetMins = (absOffsetMinutes % 60).toString().padStart(2, '0');
  const offsetString = `${offsetSign}${offsetHours}:${offsetMins}`;

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${includeOffset?offsetString:''}`;
}

export function getUserName(msg: BotInput): string | null {
  if (msg instanceof Message) {
    return msg.member?.nickname ||
        msg.member?.displayName ||
        msg.author?.displayName ||
        msg.author?.globalName ||
        msg.author?.username ||
        null;
  }

  return msg.user?.displayName ||
      msg.user?.globalName ||
      msg.member?.user?.username ||
      null;
}

export function getMusicButtons(paused = false) {

  const pauseButton = new ButtonBuilder()
    .setCustomId(MusicAction.PAUSE)
    .setLabel('Pause')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('⏸️');

  const playButton = new ButtonBuilder()
    .setCustomId(MusicAction.RESUME)
    .setLabel('Play')
    .setStyle(ButtonStyle.Success)
    .setEmoji('▶️');

  const stopButton = new ButtonBuilder()
    .setCustomId(MusicAction.STOP)
    .setLabel('Stop')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('⏹️');

  const skipButton = new ButtonBuilder()
    .setCustomId(MusicAction.SKIP)
    .setLabel('Skip')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏭️');

  return new ActionRowBuilder()
    .addComponents(paused? playButton: pauseButton ,stopButton, skipButton);
}

function maskURL(message) {
  return message.replace(/https?:\/\/[^\s)<>]+/g, function(match, offset, string) {
    const before = offset > 0 ? string[offset - 1] : '';
    const after = (offset + match.length < string.length) ? string[offset + match.length] : '';
    if (before === '<' && after === '>') return match;
    return `<${match}>`;
  });
}

export async function sendLongMessageToChannel(
    channel: GuildTextBasedChannel,
    message: string
): Promise<Message | null> {
  const msg = maskURL(message ?? "");
  const maxLength = 2000;

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${channel.id} no es un canal de texto o no existe`);
  }

  const textChannel = channel as GuildTextBasedChannel;

  if (msg.length <= maxLength) {
    return await textChannel.send(msg);
  }

  let nextIndex = 0;
  let firstMsg: Message | null = null;

  while (nextIndex < msg.length) {
    const remainingText = msg.slice(nextIndex);
    const fragmentLength = remainingText.length > maxLength ? maxLength : remainingText.length;
    const cutPoint = findCutPoint(remainingText, fragmentLength);
    const fragment = remainingText.slice(0, cutPoint);

    if (nextIndex === 0) firstMsg = await textChannel.send(fragment);
    else await textChannel.send(fragment);

    nextIndex += cutPoint;
  }

  return firstMsg;
}

export async function replyLongMessage(originalMsg: Message<boolean>, message: string, isEdit = false) {
  const msg = maskURL(message);
  const channel = originalMsg.channel as GuildTextBasedChannel;
  const maxLength = 2000;
  const referencedMessage = await channel.messages.fetch(originalMsg.reference.messageId);

  originalMsg.delete();

  if (msg.length <= maxLength) {
    if(referencedMessage) return referencedMessage.reply(msg);
    return channel.send(msg);
  }

  let nextIndex = 0;
  let firstMsg;

  while (nextIndex < msg.length) {
    const remainingText = msg.slice(nextIndex);
    const fragmentLength = remainingText.length > maxLength ? maxLength : remainingText.length;

    const cutPoint = findCutPoint(remainingText, fragmentLength);

    const fragment = remainingText.slice(0, cutPoint);

    if (nextIndex === 0) {
      if(referencedMessage) firstMsg = await referencedMessage.reply(fragment);
      else firstMsg = await channel.send(fragment);
    } else {
      await channel.send(fragment);
    }

    nextIndex += cutPoint;
  }

  return firstMsg;
}

function findCutPoint(text: string, maxLength: number): number {
  if (text.length <= maxLength) return text.length;

  const separators = ['.', '!', '?', '\n', ' '];

  const urlRegex = new RegExp("https?:\/\/[\^\s)<>]+", "g");
  let urlIntervals: { start: number; end: number }[] = [];
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urlIntervals.push({start: match.index, end: match.index + match[0].length});
  }

  const limit = Math.min(maxLength, text.length);
  for (let i = limit - 1; i >= 0; i--) {
    const char = text[i];
    if (separators.includes(char)) {
      if (char === '.') {
        const insideUrl = urlIntervals.some(interval => i >= interval.start && i < interval.end);
        if (insideUrl) continue;
      }
      return i > 0 ? i : maxLength;
    }
  }
}

export function getUnsupportedMessage(type: string, body?: string) {
  const bodyStr = body ? `, body:"${body}"` : ``;
  const typeStr = `type:"${type}"`;
  return `<Unsupported message: {${typeStr}${bodyStr}}>`
}

export function cleanMessage(msg: string): string {
  return msg
      .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ ]{2,}/g, ' ')
      .trim();
}

export function getLanguageName() {
  const locale = process.env.BOT_LOCALE ?? 'en';
  const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
  return displayNames.of(locale);
}

export function cleanFileName(name: string): string {
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
  return name.replace(invalidChars, '').replace(/\s+/g, ' ').trim();
}

export function extractJSON(input: string, botName: string): AIAnswer {
  // Remove <think> tags if they exist
  const cleanedInput = input?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  if (!cleanedInput || typeof cleanedInput !== 'string') {
    return null;
  }

  // Helper to fix common JSON string issues
  const fixJsonString = (jsonStr: string): string => {
    let fixed = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        fixed += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        fixed += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        fixed += char;
        continue;
      }

      if (inString) {
        // Escape problematic characters inside strings
        switch (char) {
          case '\n': fixed += '\\n'; break;
          case '\r': fixed += '\\r'; break;
          case '\t': fixed += '\\t'; break;
          case '\b': fixed += '\\b'; break;
          case '\f': fixed += '\\f'; break;
          default: fixed += char;
        }
      } else {
        fixed += char;
      }
    }

    return fixed;
  };

  // Helper to safely unescape nested JSON strings (for DeepSeek style responses)
  const unescapeNestedJson = (str: string): any => {
    try {
      // Handle multiple levels of JSON string escaping
      let unescaped = str;
      let attempts = 0;
      const maxAttempts = 3; // Prevent infinite loops

      while (attempts < maxAttempts) {
        try {
          const temp = JSON.parse(unescaped);
          if (typeof temp === 'string' && temp !== unescaped) {
            unescaped = temp;
            attempts++;
          } else {
            return temp; // Successfully parsed object
          }
        } catch {
          break;
        }
      }

      return JSON.parse(unescaped);
    } catch {
      return null;
    }
  };

  // Attempt 1: Direct JSON parsing
  try {
    const parsed = JSON.parse(fixJsonString(cleanedInput));
    if (parsed?.message !== undefined) {
      return parsed;
    }
  } catch (e) {
    logger.debug(`[extractAnswer] Direct JSON parsing failed: ${e.message}`);
  }

  // Attempt 2: Handle nested structure (DeepSeek style)
  try {
    const parsed = JSON.parse(fixJsonString(cleanedInput));

    // Check for nested structure like {content: {text: "escaped_json"}} or {content: "escaped_json"}
    if (parsed?.content) {
      const contentText = typeof parsed.content === 'string' ? parsed.content : parsed.content.text;

      if (typeof contentText === 'string') {
        const nestedResult = unescapeNestedJson(contentText);
        if (nestedResult?.message !== undefined) {
          logger.debug("[extractAnswer] Successfully parsed nested JSON structure");
          return nestedResult;
        }
      }
    }
  } catch (e) {
    logger.debug(`[extractAnswer] Nested structure parsing failed: ${e.message}`);
  }

  // Attempt 3: Extract JSON from mixed content using regex
  const jsonMatches = cleanedInput.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);

  if (jsonMatches) {
    for (const match of jsonMatches) {
      try {
        const parsed = JSON.parse(fixJsonString(match));
        if (parsed?.message !== undefined) {
          logger.debug("[extractAnswer] Successfully parsed regex-extracted JSON");
          return parsed;
        }
      } catch {
        continue; // Try next match
      }
    }
  }

  // Attempt 4: Look for escaped JSON patterns
  const escapedJsonMatch = cleanedInput.match(/"([^"]*(?:\\.[^"]*)*)"/);
  if (escapedJsonMatch?.[1]) {
    try {
      const nestedResult = unescapeNestedJson(`"${escapedJsonMatch[1]}"`);
      if (nestedResult?.message !== undefined) {
        logger.debug("[extractAnswer] Successfully parsed escaped JSON pattern");
        return nestedResult;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Return as plain text
  logger.debug("[extractAnswer] All parsing attempts failed, returning as plain text");
  return {
    message: cleanedInput,
    author: botName,
    type: 'text'
  };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function musicControlAction(action: string): MusicAction{
  switch(action){
    case "RESUME": return MusicAction.RESUME;
    case "PAUSE": return MusicAction.PAUSE;
    case "STOP": return MusicAction.STOP;
    case "SKIP": return MusicAction.SKIP;
  }
}

export function handleInteractionError(interaction: Interaction, e: any){
  logger.error(`Error processing interaction : ${e.message}`)
  if(interaction && interaction.isRepliable()) return interaction.reply({content: i18n.t('responses.error'), ephemeral: true});
  return;
}

export function temporalMsg(message: Message, seconds = 15){
  setTimeout(()=> message.delete(), seconds * 1000);
}

export function imageToBase64(url): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = [];

      response.on('data', (chunk) => {
        data.push(chunk);
      });

      response.on('end', () => {
        const buffer = Buffer.concat(data);
        const base64String = buffer.toString('base64');
        resolve(base64String);
      });

    }).on('error', (err) => {
      reject(err);
    });
  });
}

export function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export function downloadMp3(fileUrl, destPath): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(fileUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileStream = fs.createWriteStream(destPath);
      const request = protocol.get(urlObj, response => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Error al descargar: código de estado ${response.statusCode}`));
        }
        response.pipe(fileStream);
      });

      request.on('error', err => {
        fs.unlink(destPath, () => {});
        reject(err);
      });

      // Cuando termine de escribir el fichero
      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });

      fileStream.on('error', err => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      return destPath;
    } catch (err) {
      reject(err);
    }
  });
}

export function getAudioStream(url: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response);
      } else {
        reject(new Error(`Failed to get stream, status code: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

export function formatLyrics(lyrics) {
  return lyrics
      // Quitar saltos de línea antes de [ y después de ]
      .replace(/\s*\[\s*/g, '[')
      .replace(/\s*\]/g, ']')
      // Agregar salto de línea antes de cada [ si no hay uno ya
      .replace(/\[([^\]]+)\]/g, '\n \n[$1]\n')
      // Evitar líneas vacías múltiples
      .replace(/\n{2,}/g, '\n')
      .trim();
}

export function fechaHoraChilena(date = new Date()) {

  // Obtener la fecha y hora en la zona horaria de Chile
  const options: any = {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  // Formatear como partes para manipular fácilmente
  const parts: any = new Intl.DateTimeFormat('en-CA', options).formatToParts(date)
      .reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});

  // Formar el string final
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function normalizeYouTubeURL(url: string): string {
  try {
    const parsed = new URL(url.trim());

    if (parsed.hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1);
      let newUrl = `https://www.youtube.com/watch?v=${videoId}`;
      if (parsed.searchParams && [...parsed.searchParams].length > 0) {
        for (const [key, value] of parsed.searchParams.entries()) {
          if (key === 'v') continue;
          newUrl += `&${key}=${encodeURIComponent(value)}`;
        }
      }
      return newUrl;
    }
    return url;
  } catch (e) {
    return url;
  }
}

export function commandInteractionReply(interaction: CommandInteraction, options: string | MessagePayload | InteractionEditReplyOptions | InteractionReplyOptions): Promise<Message<boolean>>{
  if(interaction.deferred) return interaction.editReply(options as any)
  return interaction.reply(options as any) as any;
}

export function sanitizeLogImages(str: string) {
  return str.replace(/(data:image\/[a-zA-Z0-9+.-]+;base64,)[A-Za-z0-9+/=]+/g, '$1...');
}

const isTextLike = (t: string) => t === "text" || t === "ASR";
export const hasTextOrASR = (m: AiMessage) => {
  return m.content.some(c => isTextLike(c.type));
};

export function trimCachePreserveMessageStart(messages: any[], maxItems: number): any[] {
  if (!Array.isArray(messages)) return messages;

  if (countMessages(messages) > maxItems) {
    messages.splice(0, messages.length - maxItems);
  } else
    return messages;

  while (messages.length > 0 && messages[0].role != AIRole.USER && messages[0].role != AIRole.SYSTEM) {
    messages.shift();
  }
  return messages;
}

export function parseIfJson(input: any) {
  if (typeof input === 'object' && input !== null) {
    return input;
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function countMessages(aiMessageList: any): number {
  if(!aiMessageList || aiMessageList.length === 0) return 0;
  return aiMessageList.filter((i: any) => i.role === AIRole.USER || i.role === AIRole.SYSTEM || i.role === AIRole.ASSISTANT).length;
}



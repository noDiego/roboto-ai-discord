import { ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildTextBasedChannel, Interaction, Message } from 'discord.js';
import { BotInput, MusicAction } from './interfaces/discord-interfaces';
import { CONFIG } from "./config";
import logger from "./logger";
import i18n from "./locales";
import * as https from "node:https";
import { Readable } from "stream";
import path from "node:path";
import * as http from "node:http";
import fs from "fs";

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

export function extractJSON(inputString: string) {
  if (!inputString || typeof inputString !== 'string') {
    return null;
  }

  try {
    return JSON.parse(inputString.trim());
  } catch (e) {
  }

  const startMatch = inputString.match(/[{\[]/);
  if (!startMatch) {
    logger.debug("[cleanFileName] Valid JSON start character not found");
    return {message: inputString, author: CONFIG.botName, type: 'text'};
  }

  try {

    const startIndex = startMatch.index;
    let endIndex = inputString.length;
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < inputString.length; i++) {
      const char = inputString[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;

      if (i >= startIndex && openBraces === 0 && openBrackets === 0) {
        if (startMatch[0] === '{' && char === '}') {
          endIndex = i + 1;
          break;
        }
        if (startMatch[0] === '[' && char === ']') {
          endIndex = i + 1;
          break;
        }
      }
    }

    const jsonString = inputString.substring(startIndex, endIndex);

    return JSON.parse(jsonString);
  } catch (e) {
    logger.warn('There was an error trying to read the response message in the expected format. Returning the complete message.')
    return {message: inputString, author: CONFIG.botName, type: 'text'};
  }
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
  if(interaction.isRepliable()) return interaction.reply({content: i18n.t('responses.error'), ephemeral: true});
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
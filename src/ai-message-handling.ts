import { Collection, CommandInteraction, Message, Snowflake, TextBasedChannel } from 'discord.js';
import { CONFIG, generateAIPrompt } from './config';
import {
  AIAnswer,
  AiMessage,
  AIProvider,
  AIRole,
  MessageImageMetadata,
  MessageMetadata
} from './interfaces/ai-interfaces';
import Roboto from './roboto';
import { AITools } from './services/functions';
import { BotInput } from './interfaces/discord-interfaces';
import {
  extractJSON,
  fechaHoraChilena,
  getUserName
} from './utils';
import { ResponseInput } from "openai/src/resources/responses/responses";
import { GuildData } from "./interfaces/guild-data";
import logger from "./logger";
import {
  convertAttachmentsToAiMessage,
  DegradeReason,
  getMaxImageDimension,
  isSupportedImageMime,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  serializeMessageMetadata,
  VisionAttachment
} from './vision';
import { commitCheckpointIfSuccessful, getConversationKey } from './conversation';

export const lastProcessed = new Map<string, string>();

const DOWNLOAD_TIMEOUT_MS = 30_000;

class ImageDownloadError extends Error {
  constructor(public readonly reason: DegradeReason, message?: string) {
    super(message ?? reason);
    this.name = 'ImageDownloadError';
  }
}

export async function msgToAI(inputData: CommandInteraction | Message<boolean>, guildData: GuildData, commandMessage?: string, omitPreviousMsgs = false): Promise<AIAnswer> {

  const systemPrompt = generateAIPrompt(guildData.guildConfig, inputData);
  // Build the message array to send to AI. lastProcessed is only a candidate
  // here and is confirmed later, after a valid provider response.
  const { messageList, lastProcessedCandidate } = await buildMessageArray(inputData, guildData, commandMessage, omitPreviousMsgs);

  // Convert messages to OPENAI/Responses format
  const convertedMsgList = convertIaMessagesLang(messageList, AIProvider.OPENAI);

  // Send message to the selected chat provider and return response
  const answerJSON = await Roboto.chatService.sendMessage(convertedMsgList, systemPrompt, inputData, guildData, AITools);
  if (!answerJSON) return null;

  // Commit the checkpoint only after a valid final response and cache commit.
  commitCheckpointIfSuccessful(
    lastProcessed,
    getConversationKey(guildData.guildId, inputData.channelId),
    lastProcessedCandidate,
    answerJSON != null
  );

  return extractJSON(answerJSON, guildData.guildConfig.botName) as AIAnswer;
}

async function buildMessageArray(
  inputData: BotInput,
  guildData: GuildData,
  commandMessage?: string,
  omitPreviousMsgs = false
): Promise<{ messageList: AiMessage[]; lastProcessedCandidate: string | null }> {
  const key = getConversationKey(guildData.guildId, inputData.channelId);
  const lastChatMsgProcessed = lastProcessed.get(key);

  let messageList: AiMessage[] = [];

  if (!omitPreviousMsgs) {
    // Full-history path (first turn): fetch and convert recent channel messages.
    messageList = await buildHistoryMessages(inputData, guildData, lastChatMsgProcessed);
  }

  if (commandMessage != null && commandMessage !== '') {
    // Slash-command path: explicit text, no attachments on the interaction.
    const date = inputData instanceof Message ? fechaHoraChilena(inputData.createdAt) : fechaHoraChilena();
    messageList.push(makeTextMessage(commandMessage, getUserName(inputData), date));
  } else if (omitPreviousMsgs) {
    // Cached path for a Message input: convert the current message directly with
    // the same text+attachments pipeline; do not rebuild a synthetic text-only message.
    const current = await convertWspMsgToAiMsg(inputData as Message<boolean>);
    if (current) messageList.push(current);
  }

  // Remove a trailing assistant message if the list has more than one entry.
  if (messageList.length > 1 && messageList[messageList.length - 1].role === AIRole.ASSISTANT) {
    messageList.pop();
  }

  applyDimensionBudget(messageList);

  return { messageList, lastProcessedCandidate: inputData.id ?? null };
}

async function buildHistoryMessages(
  inputData: BotInput,
  guildData: GuildData,
  lastProcessedId: string | undefined
): Promise<AiMessage[]> {
  const resetCommands: string[] = ["-reset", "-r", "/reset"];
  const channel: TextBasedChannel = inputData.channel as TextBasedChannel;

  const fetchLimit = Math.min(guildData.guildConfig.maxMessages ?? CONFIG.maxMessages, 100);
  const channelMessagesCollection: Collection<string, Message<boolean>> = await channel.messages.fetch({ limit: fetchLimit }) as Collection<Snowflake, Message<boolean>>;
  let channelMessages = Array.from(channelMessagesCollection.values()).reverse();

  // Consider only messages after the last -reset command.
  const resetIndex = channelMessages.map(msg => msg.content).reduce((lastIndex, currentBody, currentIndex) => {
    return resetCommands.includes(currentBody) ? currentIndex : lastIndex;
  }, -1);
  channelMessages = resetIndex >= 0 ? channelMessages.slice(resetIndex + 1) : channelMessages;

  if (channelMessages.length > 0 && channelMessages[channelMessages.length - 1].author.bot) channelMessages.pop();

  // Skip messages already committed and messages newer than the trigger.
  let afterLastProcessed = channelMessages;
  if (lastProcessedId) {
    const idx = channelMessages.findIndex(msg => msg.id === lastProcessedId);
    if (idx >= 0) afterLastProcessed = channelMessages.slice(idx + 1);
  }

  const result: AiMessage[] = [];
  for (const channelMsg of afterLastProcessed) {
    if (inputData.createdTimestamp < channelMsg.createdTimestamp) continue;
    const cmsg = await convertWspMsgToAiMsg(channelMsg);
    if (!cmsg) continue;
    result.push(cmsg);
  }

  return result;
}

async function convertWspMsgToAiMsg(channelMsg: Message<boolean>): Promise<AiMessage | null> {
  try {
    const author = getUserName(channelMsg);
    const date = fechaHoraChilena(channelMsg.createdAt);
    const text = channelMsg.content ?? '';

    const attachments: VisionAttachment[] = Array.from(channelMsg.attachments.values()).map((a) => ({
      id: a.id,
      contentType: a.contentType,
      url: a.url,
      size: a.size,
      width: a.width ?? null,
      height: a.height ?? null
    }));

    const result = await convertAttachmentsToAiMessage(
      { messageId: channelMsg.id, isBot: channelMsg.author.bot, text, author, date, attachments },
      (url, size) => downloadImageAsDataUrl(url, size)
    );

    if (!result) return null;
    return { role: result.role, name: result.name, content: result.content, metadata: result.metadata };
  } catch (e) {
    logger.error(e.message);
    return {
      role: AIRole.USER,
      name: 'User',
      content: [{ type: 'text', value: `<Error Reading Message>`, date: fechaHoraChilena(channelMsg.createdAt) }],
      metadata: { message: '<Error Reading Message>', author: 'User', date: fechaHoraChilena(channelMsg.createdAt), images: [] }
    };
  }
}

function makeTextMessage(text: string, author: string | null, date: string): AiMessage {
  return {
    role: AIRole.USER,
    name: author ?? undefined,
    content: [],
    metadata: { message: text, author: author ?? 'User', date, images: [] }
  };
}

// Applies the 15+ images -> 4096px rule once the final image count is known.
function applyDimensionBudget(messageList: AiMessage[]): void {
  const totalImages = messageList.reduce((sum, msg) => sum + msg.content.filter(c => c.type === 'image').length, 0);
  const limit = getMaxImageDimension(totalImages);
  if (limit >= MAX_IMAGE_DIMENSION) return;

  for (const msg of messageList) {
    for (let i = msg.content.length - 1; i >= 0; i--) {
      const c = msg.content[i];
      if (c.type !== 'image') continue;
      if ((c.width != null && c.width > limit) || (c.height != null && c.height > limit)) {
        msg.content.splice(i, 1);
        const img = msg.metadata?.images.find(m => m.imageId === c.image_id);
        if (img) img.reason = 'dimensions_exceeded';
      }
    }
  }
}

async function downloadImageAsDataUrl(url: string, expectedSize?: number): Promise<{ dataUrl: string; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) throw new ImageDownloadError('timeout');
      throw new ImageDownloadError('download_failed', (e as Error).message);
    }

    if (!res.ok) throw new ImageDownloadError('download_failed', `HTTP ${res.status}`);

    const contentType = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!isSupportedImageMime(contentType)) throw new ImageDownloadError('unsupported_type', contentType);

    const contentLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) throw new ImageDownloadError('too_large');
    if (expectedSize != null && expectedSize > MAX_IMAGE_BYTES) throw new ImageDownloadError('too_large');

    const reader = res.body?.getReader();
    if (!reader) throw new ImageDownloadError('download_failed');

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageDownloadError('too_large');
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    return { dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`, contentType };
  } catch (e) {
    if (e instanceof ImageDownloadError) throw e;
    throw new ImageDownloadError('download_failed', (e as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}


function convertIaMessagesLang(messageList: AiMessage[], lang: AIProvider): ResponseInput {
  switch (lang) {
    case AIProvider.OPENAI: {
      const chatgptMessageList: ResponseInput = [];
      messageList.forEach(msg => {
        const fromBot = msg.role == AIRole.ASSISTANT;
        const gptContent: Array<any> = [];

        const metadata = { ...(msg.metadata ?? buildFallbackMetadata(msg)) };
        if (metadata.message) metadata.message = metadata.message.replace(`<@${CONFIG.botClientID}>`, CONFIG.botName);

        gptContent.push({
          type: fromBot ? 'output_text' : 'input_text',
          text: serializeMessageMetadata(metadata)
        });

        for (const c of msg.content) {
          if (c.type === 'image') {
            gptContent.push({ type: 'input_image', image_url: c.value });
          }
        }

        chatgptMessageList.push({ content: gptContent, role: msg.role });
      });

      return chatgptMessageList;
    }

    case AIProvider.DEEPINFRA: { // Unused
      const otherMsgList: ResponseInput = [];
      messageList.forEach(msg => {
        const fromBot = msg.role == AIRole.ASSISTANT;
        const gptContent: Array<any> = [];
        const metadata = { ...(msg.metadata ?? buildFallbackMetadata(msg)) };
        gptContent.push({
          type: fromBot ? 'output_text' : 'input_text',
          text: serializeMessageMetadata(metadata)
        });
        for (const c of msg.content) {
          if (c.type === 'image') {
            gptContent.push({ type: 'input_text', text: JSON.stringify({ unsupported_image: true }) });
          }
        }
        otherMsgList.push({ content: gptContent, role: msg.role });
      });

      return otherMsgList;
    }

    default:
      return [];
  }
}

function buildFallbackMetadata(msg: AiMessage): MessageMetadata {
  const text = msg.content.find(c => c.type === 'text')?.value ?? '';
  const images: MessageImageMetadata[] = msg.content
    .filter(c => c.type === 'image')
    .map((c, i) => ({ imageId: c.image_id ?? `img-${i}`, attachmentIndex: c.attachment_index ?? i }));
  return { message: text, author: msg.name ?? 'User', date: msg.content[0]?.date ?? fechaHoraChilena(), images };
}

import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { Tool } from 'openai/src/resources/responses/responses';
import type { BotInput } from '../interfaces/discord-interfaces';
import type { GuildData } from '../interfaces/guild-data';

/**
 * Minimal chat provider contract shared by OpenAI, Anthropic and future providers
 * (e.g. DeepSeek). It intentionally excludes OpenAI-exclusive capabilities
 * (image generation/editing, TTS, lyrics, customMsg) so those keep depending on
 * the dedicated OpenAI client exposed through `Roboto.openAI`.
 */
export interface ChatService {
  sendMessage(
    openAiMessageInputList: ResponseInputItem[],
    systemPrompt: string,
    inputData: BotInput,
    guildData: GuildData,
    tools: Tool[]
  ): Promise<string>;

  hasChatCache(id: string): boolean;

  deleteChatCache(id: string): void;
}

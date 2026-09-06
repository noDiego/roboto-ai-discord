import Anthropic from '@anthropic-ai/sdk';
import NodeCache from 'node-cache';
import { CONFIG } from '../config';
import logger from '../logger';
import Roboto from '../roboto';
import { BotInput } from '../interfaces/discord-interfaces';
import { GuildData } from '../interfaces/guild-data';
import { Tool } from 'openai/src/resources/responses/responses';
import { ResponseInputItem } from 'openai/resources/responses/responses';
import { ChatService } from './chat-service';

function convertOpenAIToAnthropicMessages(openAiMessages: any[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  let system = '';
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of openAiMessages) {
    if (!msg || !msg.role) continue;

    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        system = msg.content;
      } else if (Array.isArray(msg.content)) {
        system = msg.content.map((c: any) => c.text || '').join('');
      }
      continue;
    }

    const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';
    const content: Anthropic.ContentBlockParam[] = [];

    if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === 'input_text' || c.type === 'text') {
          if (c.text) content.push({ type: 'text', text: c.text });
        } else if (c.type === 'output_text') {
          if (c.text) content.push({ type: 'text', text: c.text });
        } else if (c.type === 'input_image') {
          const imageUrl: string = c.image_url;
          if (imageUrl?.startsWith('data:')) {
            const [header, data] = imageUrl.split(',');
            const mediaType = header.split(':')[1].split(';')[0];
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType as any, data }
            });
          } else if (imageUrl) {
            content.push({
              type: 'image',
              source: { type: 'url', url: imageUrl } as any
            });
          }
        }
      }
    } else if (typeof msg.content === 'string') {
      if (msg.content) content.push({ type: 'text', text: msg.content });
    }

    if (content.length === 0) continue;

    // Merge consecutive messages of same role (Anthropic requires alternating)
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === role) {
      (lastMsg.content as Anthropic.ContentBlockParam[]).push(...content);
    } else {
      messages.push({ role, content });
    }
  }

  return { system, messages };
}

function convertToAnthropicFunctionTools(openAiTools: Tool[]): Anthropic.Tool[] {
  const result: Anthropic.Tool[] = [];
  for (const tool of openAiTools) {
    if (tool.type !== 'function') continue;
    result.push({
      name: tool.name,
      description: tool.description || '',
      input_schema: (tool.parameters || { type: 'object', properties: {} }) as any
    });
  }
  return result;
}

function hasWebSearchTool(openAiTools: Tool[]): boolean {
  return openAiTools.some(t => t.type === 'web_search');
}

export class AnthropicService implements ChatService {
  private anthropic: Anthropic;
  private messagesCache = new NodeCache();
  private readonly cacheTime = 24 * 60 * 60;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC.apiKey });
  }

  public deleteChatCache(id: string) {
    this.messagesCache.del(id);
  }

  public addMessageToCache(_item: ResponseInputItem, _id: string) {
    // Cache is managed internally by sendMessage
  }

  public hasChatCache(id: string): boolean {
    return this.messagesCache.has(id);
  }

  public async sendMessage(
    openAiMessageInputList: ResponseInputItem[],
    systemPrompt: string,
    inputData: BotInput,
    guildData: GuildData,
    openAiTools: Tool[]
  ): Promise<string> {
    let cycleCount = 0;
    const maxCycles = CONFIG.maxCycles;
    const cacheKey = inputData.guildId + inputData.channelId;

    const cachedMessages: Anthropic.MessageParam[] = this.messagesCache.get(cacheKey) || [];

    const { messages: newMessages } = convertOpenAIToAnthropicMessages(openAiMessageInputList);

    const anthropicMessages: Anthropic.MessageParam[] = [...cachedMessages, ...newMessages];

    const functionTools = convertToAnthropicFunctionTools(openAiTools);
    const tools: any[] = [...functionTools];
    if (hasWebSearchTool(openAiTools)) {
      tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    }

    while (cycleCount < maxCycles) {
      const response = await this.callAnthropicAPI(anthropicMessages, systemPrompt, tools);

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];

      anthropicMessages.push({ role: 'assistant', content: response.content as any });

      if (toolUseBlocks.length > 0 && response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolBlock of toolUseBlocks) {
          const functionResult = await Roboto.executeFunctions(
            toolBlock.name,
            JSON.stringify(toolBlock.input),
            inputData
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ result: functionResult })
          });
        }

        anthropicMessages.push({ role: 'user', content: toolResults });
        cycleCount++;
        continue;
      }

      const textBlocks = response.content.filter(b => b.type === 'text') as Anthropic.TextBlock[];
      const rawText = textBlocks.map(b => b.text).join('');
      const responseText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      const max = guildData.guildConfig.maxMessages ?? 30;
      const trimmed = anthropicMessages.length > max
        ? anthropicMessages.slice(-max)
        : anthropicMessages;

      this.messagesCache.set(cacheKey, trimmed, this.cacheTime);

      logger.debug('[Anthropic] Response: ' + responseText.substring(0, 200));
      return responseText;
    }

    throw new Error(`Reached the limit of ${maxCycles} communication cycles with Anthropic.`);
  }

  private async callAnthropicAPI(
    messages: Anthropic.MessageParam[],
    system: string,
    tools: any[]
  ): Promise<Anthropic.Message> {
    logger.info(`[Anthropic] Sending ${messages.length} messages`);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: CONFIG.ANTHROPIC.chatModel,
      max_tokens: 4096,
      messages,
      ...(system ? { system } : {}),
      ...(tools.length > 0 ? { tools } : {})
    };

    const response = await this.anthropic.messages.create(params);

    logger.debug(`[Anthropic] Usage: Input=${response.usage.input_tokens} Output=${response.usage.output_tokens}`);

    return response;
  }

  async webSearch(searchQuery: string): Promise<string> {
    logger.info(`[Anthropic->webSearch] Searching "${searchQuery}"`);

    const response = await this.anthropic.messages.create({
      model: CONFIG.ANTHROPIC.chatModel,
      max_tokens: 2048,
      system:
        'Rol: Buscador de información web.\n\n' +
        'Instrucciones:\n' +
        '- Cada mensaje es una consulta de búsqueda.\n' +
        '- Busca en la web y extrae información relevante, precisa y actualizada.\n' +
        '- Organiza en secciones claras con listas cuando aplique.\n' +
        '- Incluye enlaces directos a las fuentes en cada punto.\n' +
        '- Sin tono conversacional ni opiniones. Sin introducciones ni conclusiones. Solo información objetiva.',
      messages: [{ role: 'user', content: searchQuery }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as any]
    });

    const textBlocks = response.content.filter(b => b.type === 'text') as Anthropic.TextBlock[];
    return textBlocks.map(b => b.text).join('');
  }
}

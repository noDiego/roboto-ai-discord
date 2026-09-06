import OpenAI from 'openai';
import NodeCache from 'node-cache';
import Ajv, { ValidateFunction } from 'ajv';
import { CONFIG } from '../config';
import logger from '../logger';
import Roboto from '../roboto';
import {
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
  Tool
} from 'openai/src/resources/responses/responses';
import { ChatService } from './chat-service';
import { BotInput } from '../interfaces/discord-interfaces';
import { GuildData } from '../interfaces/guild-data';
import { AITools } from './functions';
import { extractJSON, sanitizeLogImages } from '../utils';

// Base URL for the DeepSeek Responses API. Kept as a code constant on purpose:
// this delivery does not expose a base URL override.
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// JSON Schema used with `text.format.type === 'json_schema'` so the model
// returns an `AIAnswer`-shaped object. `extractJSON` remains as fallback.
const AI_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    author: { type: 'string' },
    type: { type: 'string', enum: ['text', 'voice'] }
  },
  required: ['message', 'author', 'type'],
  additionalProperties: false
};

// Transforms an OpenAI-style tool `parameters` schema into a plain JSON Schema
// that `ajv` can validate. It removes the OpenAI-only `strict`/`nullable`
// keywords and, where `nullable: true`, widens `type` (and `enum`) to accept
// `null`, mirroring OpenAI's semantics.
function toStandardSchema(schema: any): any {
  if (Array.isArray(schema)) {
    return schema.map(toStandardSchema);
  }
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'strict' || key === 'nullable') {
      continue;
    }
    result[key] = toStandardSchema(value);
  }

  if (schema.nullable === true) {
    let type = result.type;
    if (typeof type === 'string') {
      type = [type, 'null'];
    } else if (Array.isArray(type)) {
      if (!type.includes('null')) {
        type = [...type, 'null'];
      }
    } else if (type === undefined) {
      type = 'null';
    }
    result.type = type;

    if (Array.isArray(result.enum) && !result.enum.includes(null)) {
      result.enum = [...result.enum, null];
    }
  }

  return result;
}

// Deep copy of a Responses input transcript. Avoids sharing mutable arrays and
// objects with the cache or with the OpenAI/Anthropic services.
function cloneItem<T>(item: T): T {
  return structuredClone(item);
}

// Builds a DeepSeek copy of the tools: never mutates the global `AITools`
// array and omits `strict` so the strict-beta mode is never enabled
// accidentally for a mixed strict/non-strict tool set.
function buildDeepSeekTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const copy = structuredClone(tool);
    if (copy.type === 'function') {
      delete (copy as any).strict;
    }
    return copy;
  });
}

function buildToolValidators(tools: Tool[]): Map<string, ValidateFunction> {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const map = new Map<string, ValidateFunction>();
  for (const tool of tools) {
    if (tool.type !== 'function' || !tool.name) {
      continue;
    }
    const schema = toStandardSchema((tool as any).parameters) ?? { type: 'object', properties: {} };
    try {
      map.set(tool.name, ajv.compile(schema));
    } catch (e) {
      logger.error(`[DeepSeek] Could not compile JSON schema for tool "${tool.name}": ${(e as Error).message}`);
    }
  }
  return map;
}

// Trims a Responses transcript by complete turns instead of by raw item count.
// A turn starts at an input item (a Discord history message has no `type`
// field). Every output item (reasoning/message/function_call/
// function_call_output/web_search_call) belongs to the turn that precedes it,
// so cutting at turn boundaries keeps complete reasoning/tool blocks and never
// leaves an orphan `function_call_output` without its `function_call`.
function trimDeepSeekTranscript(items: ResponseInput, maxTurns: number): ResponseInput {
  if (!Array.isArray(items) || items.length === 0) {
    return items;
  }

  const turnStarts: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as any;
    if (item && typeof item === 'object' && !item.type) {
      turnStarts.push(i);
    }
  }

  const max = Math.max(1, maxTurns);
  if (turnStarts.length <= max) {
    return items;
  }

  const keepFrom = turnStarts[turnStarts.length - max];
  return items.slice(keepFrom);
}

export class DeepSeekService implements ChatService {
  private deepSeek: OpenAI;
  private messagesCache = new NodeCache();
  private readonly cacheTime = 24 * 60 * 60;
  private readonly tools: Tool[];
  private readonly toolValidators = new Map<string, ValidateFunction>();

  constructor() {
    if (!CONFIG.DEEPSEEK.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set. It is required when AI_PROVIDER=DEEPSEEK.');
    }

    this.deepSeek = new OpenAI({
      apiKey: CONFIG.DEEPSEEK.apiKey,
      baseURL: DEEPSEEK_BASE_URL
    });

    this.tools = buildDeepSeekTools(AITools);
    this.toolValidators = buildToolValidators(AITools);
  }

  public deleteChatCache(id: string): void {
    this.messagesCache.del(id);
  }

  public hasChatCache(id: string): boolean {
    return this.messagesCache.has(id);
  }

  public async sendMessage(
    openAiMessageInputList: ResponseInputItem[],
    systemPrompt: string,
    inputData: BotInput,
    guildData: GuildData,
    _tools: Tool[]
  ): Promise<string> {
    let cycleCount = 0;
    const maxCycles = CONFIG.maxCycles;
    const cacheKey = `${inputData.guildId}:${inputData.channelId}`;

    // Work on a copy of the cached transcript so a failure below never
    // contaminates the previously committed cache.
    const cached: ResponseInput = this.messagesCache.get(cacheKey) || [];
    const transcript: ResponseInput = cached.map(cloneItem);
    for (const item of openAiMessageInputList) {
      transcript.push(cloneItem(item));
    }

    while (cycleCount < maxCycles) {
      const aiResponse = await this.callDeepSeek(transcript, systemPrompt);

      let hasFunctionCall = false;
      const functionOutputs: ResponseInputItem[] = [];

      for (const output of aiResponse.output as ResponseOutputItem[]) {
        transcript.push(cloneItem(output) as any);

        if (output.type === 'function_call') {
          hasFunctionCall = true;
          functionOutputs.push(await this.executeValidatedFunction(output, inputData));
        } else if (output.type !== 'message' && output.type !== 'reasoning' && output.type !== 'web_search_call') {
          logger.error(`[DeepSeek] Unknown output type received: "${(output as any).type}". Please report this issue.`);
        }
      }

      transcript.push(...functionOutputs);
      cycleCount += 1;

      if (!hasFunctionCall) {
        const max = guildData.guildConfig.maxMessages ?? 30;
        const trimmed = trimDeepSeekTranscript(transcript, max);
        // Commit the new version only after a valid final response.
        this.messagesCache.set(cacheKey, trimmed, this.cacheTime);
        return this.normalizeFinalAnswer(aiResponse.output_text, guildData.guildConfig.botName || CONFIG.botName);
      }
    }

    throw new Error(`[DeepSeek] Reached the limit of ${maxCycles} communication cycles with DeepSeek.`);
  }

  private async callDeepSeek(transcript: ResponseInput, systemPrompt: string): Promise<OpenAI.Responses.Response> {
    logger.info(`[DeepSeek] Sending ${transcript.length} items`);
    logger.debug(`[DeepSeek] Sending Msg: ${sanitizeLogImages(JSON.stringify(transcript[transcript.length - 1]))}`);

    const response = await this.deepSeek.responses.create({
      model: CONFIG.DEEPSEEK.chatModel,
      input: transcript,
      instructions: systemPrompt,
      tools: this.tools,
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_answer',
          schema: AI_ANSWER_SCHEMA,
          strict: false
        }
      },
      reasoning: { effort: 'low' }
    });

    logger.debug(`[DeepSeek] Usage: Input=${response.usage?.input_tokens} Output=${response.usage?.output_tokens}`);
    logger.debug(`[DeepSeek] Response: ${sanitizeLogImages(JSON.stringify(response.output_text))}`);

    return response;
  }

  // Validates a function call before dispatching it to
  // `Roboto.executeFunctions`. Invalid calls produce an error output and never
  // reach side-effectful handlers.
  private async executeValidatedFunction(output: any, inputData: BotInput): Promise<ResponseInputItem> {
    const validationError = this.validateFunctionArguments(output.name, output.arguments);
    const result = validationError !== null
      ? validationError
      : await Roboto.executeFunctions(output.name, output.arguments, inputData);

    return {
      type: 'function_call_output',
      call_id: output.call_id,
      output: JSON.stringify({ result })
    };
  }

  private validateFunctionArguments(name: string, rawArguments: string): string | null {
    const validator = this.toolValidators.get(name);
    if (!validator) {
      return `Function "${name}" is not allowed.`;
    }

    let args: any;
    try {
      args = JSON.parse(rawArguments);
    } catch {
      return `Arguments for function "${name}" are not valid JSON.`;
    }

    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return `Arguments for function "${name}" must be a JSON object.`;
    }

    if (!validator(args)) {
      const errors = (validator.errors || [])
        .map((e) => `${e.instancePath || '/'} ${e.message || 'invalid'}`)
        .join('; ');
      return `Arguments for function "${name}" do not match the expected schema: ${errors}`;
    }

    return null;
  }

  // Normalizes the raw `output_text` into a complete `AIAnswer`-shaped JSON
  // string. `extractJSON` may return partial objects, so this guarantees a
  // string `message`, an `author` (falling back to the configured name) and a
  // valid `type`.
  private normalizeFinalAnswer(rawText: string, botName: string): string {
    const parsed = extractJSON(rawText, botName) as any;

    let message: string;
    if (parsed?.message != null) {
      message = typeof parsed.message === 'string' ? parsed.message : String(parsed.message);
    } else {
      message = (rawText ?? '').trim();
    }

    let author: string;
    if (parsed?.author != null && typeof parsed.author === 'string' && parsed.author.length > 0) {
      author = parsed.author;
    } else {
      author = botName;
    }

    const type = parsed?.type === 'voice' ? 'voice' : 'text';

    return JSON.stringify({ message, author, type });
  }
}

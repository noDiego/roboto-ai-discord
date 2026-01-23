import OpenAI, { toFile } from 'openai';
import { CONFIG } from '../config';
import logger from '../logger';
import Roboto from '../roboto';
import { ResponseInput, Tool } from "openai/src/resources/responses/responses";
import { songPrompt } from "../custom";
import { ResponseInputItem } from "openai/resources/responses/responses";
import NodeCache from "node-cache";
import { AIRole } from "../interfaces/ai-interfaces";
import { sanitizeLogImages, trimCachePreserveMessageStart } from "../utils";
import { BotInput } from "../interfaces/discord-interfaces";
import { GuildData } from "../interfaces/guild-data";

export class OpenAIService {
  private openAI: OpenAI;
  private messagesCache = new NodeCache();
  private readonly cacheTime = 24 * 60 * 60;

  constructor() {
    this.openAI = new OpenAI({
      apiKey: CONFIG.OPENAI.apiKey
    });
  }

  public deleteChatCache(id: string){
    this.messagesCache.del(id);
  }

  public addMessageToCache(item: ResponseInputItem, id: string){
    const openAiMessages: ResponseInput = this.messagesCache.get(id) || [];
    openAiMessages.push(item);
    this.messagesCache.set(id, openAiMessages, this.cacheTime);
  }

  public hasChatCache(id: string): boolean {
    return this.messagesCache.has(id);
  }

  public async sendMessage(openAiMessageInputList: ResponseInputItem[], systemPrompt: string, inputData: BotInput, guildData: GuildData, tools: Tool[]): Promise<string> {
    let cycleCount = 0;
    const maxCycles = 6;
    const guildId = guildData.guildId;

    const openAiMessages: ResponseInput = this.messagesCache.get(inputData.guildId+inputData.channelId) || [];
    openAiMessages.push(...openAiMessageInputList)

    while (cycleCount < maxCycles) {
      const aiResponse = await this.sendToResponsesAPI(openAiMessages, 'text', tools, systemPrompt, inputData.channelId);

      let hasFunctionCall = false;
      const functionOutputs= [];

      for (const output of aiResponse.output) {
        openAiMessages.push(output);
        if (output.type === 'function_call') {
          hasFunctionCall = true;
          const functionResult = await Roboto.executeFunctions(output.name, output.arguments, inputData);
          functionOutputs.push({
            type: "function_call_output",
            call_id: output.call_id,
            output: JSON.stringify({result: functionResult})
          });
        } else if(output.type !== 'message' && output.type !== 'reasoning' && output.type !== 'web_search_call'){
          logger.error(`Unknown output type received from OpenAI: "${output.type}". Please report this issue.`);
        }
      }

      openAiMessages.push(...functionOutputs);

      cycleCount += 1;

      if (!hasFunctionCall) {

        const max = guildData.guildConfig.maxMessages ?? 30;
        const sanitized = trimCachePreserveMessageStart(openAiMessages, max);

        this.messagesCache.set(inputData.guildId+inputData.channelId, sanitized, this.cacheTime);
        return aiResponse.output_text;
      }
    }

    throw new Error(`Reached the limit of ${maxCycles} communication cycles with OpenAI.`);
  }

  private async sendToResponsesAPI(
      messageList: ResponseInput,
      responseType: 'json_object'|'text' = 'json_object',
      tools: Array<Tool>,
      systemPrompt?: string,
      cacheKey?: string
  ): Promise<OpenAI.Responses.Response> {
    logger.info(`[OpenAI] Sending ${messageList.length} messages`);
    logger.debug(`[OpenAI] Sending Msg: ${sanitizeLogImages(JSON.stringify(messageList[messageList.length - 1]))}`);

    const isGpt4 = CONFIG.OPENAI.chatModel.toLowerCase().includes('gpt-4');

    const hasSystemMsg = (messageList[0] as any).role == AIRole.SYSTEM;
    if(systemPrompt) {
      if(hasSystemMsg) messageList.shift();
      messageList.unshift({role: AIRole.SYSTEM, content: systemPrompt});
    }

    const responseResult = await this.openAI.responses.create({
      model: CONFIG.OPENAI.chatModel,
      input: messageList,
      text: { format: { type: responseType }, verbosity: isGpt4? undefined : "low" },
      reasoning: { summary: null, effort: isGpt4? undefined : 'low' },
      tools: tools,
      prompt_cache_key: cacheKey,
      // max_output_tokens: 4096,
      store: true
    });

    logger.debug(`[OpenAI] ResponsesAPI Usage: Input=${responseResult.usage.input_tokens}` + ` Cached=${responseResult.usage.input_tokens_details?.cached_tokens}` + ` Output=${responseResult.usage.output_tokens}`);
    logger.debug('[OpenAI] ResponsesAPI Response:' + sanitizeLogImages(JSON.stringify(responseResult.output_text)));

    return responseResult;
  }

  //This function is used to prevent the bug that occurs when trying to use the built-in OpenAI tool together with many other functions
  async webSearch(searchQuery: string){

    logger.info(`[OpenAI->webSearch] Searching "${searchQuery}"`);

    const responseResult = await this.openAI.responses.create({
      input: [
          {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "Rol: Buscador de información web.\n" +
                "\n" +
                "Instrucciones:\n" +
                "- Cada mensaje es una consulta de búsqueda.\n" +
                "- Busca en la web y extrae información relevante, precisa y actualizada.\n" +
                "- Organiza en secciones claras con listas cuando aplique.\n" +
                "- Incluye enlaces directos a las fuentes en cada punto.\n" +
                "- Sin tono conversacional ni opiniones. Sin introducciones ni conclusiones. Solo información objetiva.\n" +
                "\n" +
                "Formato de salida:\n" +
                "Resultados sobre [tema]\n" +
                "\n" +
                "1. Definición y contexto\n" +
                "- [Resumen breve]\n" +
                "Fuente: [URL]\n" +
                "\n" +
                "2. Aspectos relevantes / Características\n" +
                "- [Punto principal]\n" +
                "Fuente: [URL]\n" +
                "\n" +
                "3. Noticias recientes / Actualizaciones\n" +
                "- [Breve descripción]\n" +
                "Fuente: [URL]\n"
          }
        ]
      },{
        role: "user",
        content: [
          {
            type: "input_text",
            text: searchQuery
          }
        ]
      }],
      model: 'gpt-5-mini',
      reasoning: {
        effort:'low',
        summary:'auto'
      },
      store: false,
      stream: false,
      text: {
        format: {
          type: "text"
        },
        verbosity: "low"
      },
      temperature: 1,
      tools: [
        {
          type: "web_search",
          user_location: {
            "type": "approximate"
          },
          search_context_size: "medium"
        }
      ]
    });

    return responseResult.output_text;
  }

  async customMsg(messages: ResponseInput, options?: any){

    logger.info(`[OpenAI->customMsg] Sending custom Messages`);

    const responseResult = await this.openAI.responses.create({
      model: 'gpt-4.1-mini',
      input: messages,
      text: { format: { type: 'text' } },
      reasoning: {},
      temperature: 1,
      max_output_tokens: options?.max_output_tokens || 3000,
      top_p: 1,
      store: true
    });

    return responseResult.output_text;
  }

  /**
   * Generates one or more images from a text prompt using the configured image model.
   *
   * @param prompt    The textual description to guide image generation.
   * @param options   Optional parameters:
   *                   - n: number of images to generate (default 1)
   *                   - size: dimensions, e.g. "1024x1024" (default)
   *                   - quality: "low"|"medium"|"high"|"auto"
   *                   - background: "opaque"|"transparent"|"auto"
   * @returns         A Promise resolving to an array of generated image objects (URLs or base64 data).
   */
  async createImage(
      prompt: string,
      options?: {
        n?: number;
        size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
        quality?: "low" | "medium" | "high" | "auto";
        background?: "opaque" | "transparent" | "auto";
        output_format: 'png' | 'jpeg' | 'webp'
      },
  ) {
    logger.debug(`[OpenAI->createImage] Prompt: "${prompt}"`);

    const params: OpenAI.Images.ImageGenerateParams = {
      model: CONFIG.OPENAI.imageModel,
      prompt,
      n: options?.n ?? 1,
      size: options?.size ?? "1536x1024",
      quality: options?.quality ?? "low",
      background: options?.background ?? "auto",
      output_format: options?.output_format ?? "jpeg",
      moderation: 'low'
    };

    const response = await this.openAI.images.generate(params);
    logger.debug(`[OpenAI->createImage] Image generated`);

    return response.data;
  }


  /**
   * Edits or composes one or more existing images using a text prompt and optional mask.
   *
   * @param imageStreams  Array of image streams or blobs to be edited.
   * @param prompt        Text description of desired edits or composition.
   * @param maskStream    Optional stream or blob containing an alpha-mask to apply to the first image.
   * @param options       Optional parameters:
   *                       - n: number of output images (default 1)
   *                       - size: output dimensions (default "1024x1024")
   *                       - quality: "low"|"medium"|"high"|"auto"
   *                       - background: "opaque"|"transparent"|"auto"
   * @returns             A Promise resolving to an array of edited image objects.
   */
  async editImage(
      imageStreams: Array<NodeJS.ReadableStream | Blob>,
      prompt: string,
      maskStream?: NodeJS.ReadableStream | Blob,
      options?: {
        n?: number;
        size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
        quality?: "low" | "medium" | "high" | "auto";
        background?: "opaque" | "transparent" | "auto";
        output_format: 'png' | 'jpeg' | 'webp'
      }
  ) {
    logger.debug(`[OpenAI->editImage] Prompt: "${prompt}"`);

    // Convert each input stream/blob into File objects
    const imageFiles = await Promise.all(
        imageStreams.map((stream, idx) =>
            toFile(stream, `image_${idx}.png`, { type: "image/png" })
        )
    );

    // Si nos pasan máscara, la convertimos (se aplicará a imageFiles[0])
    let maskFile;
    if (maskStream) {
      maskFile = await toFile(maskStream, "mask.png", { type: "image/png" });
    }

    // Armamos los parámetros para la llamada
    const params: any = {
      model: CONFIG.OPENAI.imageModel,
      image: imageFiles,
      prompt,
      n: options?.n ?? 1,
      size: options?.size ?? "1024x1024",
      quality: options?.quality ?? "low",
      background: options?.background ?? "auto",
      output_format: options?.output_format ?? 'jpeg',
      moderation: 'low'
    };

    if (maskFile) {
      params.mask = maskFile;
    }

    // Llamada a la API
    const response = await this.openAI.images.edit(params);

    logger.debug(`[OpenAI->editImage] Image(s) edited`);

    return response.data;
  }

  async speechStream(
      message: string,
      instructions?: string,
      voice?: string,
      responseFormat: 'mp3' | 'opus' | 'aac' | 'flac' = 'opus'
  ): Promise<import('stream').Readable> {
    logger.debug(`[OpenAI->speech] Creating streamed speech audio for: "${message}". Voice: "${voice}". Instructions: "${instructions}".`);
    const response = await this.openAI.audio.speech.create({
      model: CONFIG.OPENAI.speechModel,
      instructions: instructions,
      voice: voice?.toLowerCase() ?? CONFIG.OPENAI.speechVoice as any,
      input: message,
      response_format: responseFormat,
    });

    if (!response.body) {
      throw new Error('OpenAI audio.speech.create returned no body');
    }

    return response.body as any;
  }


  async lyricSongGeneration(prompt: string, title: string){

    logger.info(`[OpenAI->lyricSongGeneration] Generating song with: "${prompt}"`);

    const maxRetries = 3;
    const maxCharacters = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`[OpenAI->lyricSongGeneration] Attempt ${attempt} of ${maxRetries}`);

      const messages = structuredClone(songPrompt);

      messages.push({
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Prompt para generar la canción ${title?`titulada "${title}"`:``}: ${prompt}.${attempt > 1 ? ` IMPORTANTE: La letra debe tener un máximo de ${maxCharacters-200} caracteres.` : ''}`
          }
        ]
      });

      const responseResult = await this.openAI.responses.create({
        model: 'gpt-5.1',
        input: messages,
        store: true
      });

      const outputText = responseResult.output_text;
      const characterCount = outputText.length;

      logger.info(`[OpenAI->lyricSongGeneration] Generated ${characterCount} characters`);

      if (characterCount <= maxCharacters) {
        logger.info(`[OpenAI->lyricSongGeneration] Success on attempt ${attempt}`);
        return outputText;
      }

      logger.warn(`[OpenAI->lyricSongGeneration] Attempt ${attempt} exceeded limit: ${characterCount}/${maxCharacters} characters`);

      if (attempt === maxRetries) {
        logger.error(`[OpenAI->lyricSongGeneration] Max retries reached. Truncating output.`);
        return outputText.substring(0, maxCharacters);
      }
    }
  }


}

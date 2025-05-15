import OpenAI, { toFile } from 'openai';
import { CONFIG } from '../config';
import logger from '../logger';
import Roboto from '../roboto';
import { BotInput } from '../interfaces/discord-interfaces';
import { ResponseInput, Tool } from "openai/src/resources/responses/responses";
import { songPrompt } from "../custom";

export class OpenAIService {
  private openAI: OpenAI;

  constructor() {
    this.openAI = new OpenAI({
      apiKey: CONFIG.OPENAI.apiKey
    });
  }

  async sendChatWithTools(
      messageList: ResponseInput,
      responseType: any = 'text',
      inputData: BotInput,
      tools: Array<Tool>
  ): Promise<string> {
    logger.info(`[OpenAI] Sending ${messageList.length} messages`);
    logger.debug(`[OpenAI] Sending Msg: ${JSON.stringify(messageList[messageList.length - 1])}`);

    const responseResult = await this.openAI.responses.create({
      model: CONFIG.OPENAI.chatModel,
      input: messageList,
      text: { format: { type: responseType } },
      reasoning: {},
      tools: tools,
      temperature: 1,
      max_output_tokens: 2048,
      top_p: 1,
      store: true
    });

    logger.debug('[OpenAI] Completion Response:' + JSON.stringify(responseResult.output_text));

    const functionCalls = responseResult.output.filter(toolCall => toolCall.type === "function_call");
    if (functionCalls.length === 0) return responseResult.output_text;

    const updatedMessages: ResponseInput = [...messageList as any];

    for (const toolCall of functionCalls) {
      updatedMessages.push(toolCall);

      const name = toolCall.name;
      const args = JSON.parse(toolCall.arguments);

      logger.debug(`[OpenAI] Called function "${name}".`);
      logger.debug(`[OpenAI] Args: ${JSON.stringify(args)}`);

      try {
        const result = await Roboto.executeFunctions(name, args, inputData);
        updatedMessages.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: result.toString()
        });
      } catch (error) {
        logger.error(`[OpenAI] Error executing function ${name}:`, error);
        updatedMessages.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: `Error executing function ${name}.`
        });
      }
    }

    return this.sendChatWithTools(updatedMessages, responseType, inputData, tools);
  }

  //This function is used to prevent the bug that occurs when trying to use the built-in OpenAI tool together with many other functions
  async webSearch(searchQuery: string){

    logger.info(`[OpenAI->webSearch] Searching "${searchQuery}"`);

    const responseResult = await this.openAI.responses.create({
      model: 'gpt-4.1-mini',
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: searchQuery
          }
        ]
      }],
      text: { format: { type: 'text' } },
      reasoning: {},
      tools: [
        {
          type: "web_search_preview",
          user_location: {
            type: "approximate"
          },
          search_context_size: "medium"
        }
      ],
      temperature: 1,
      max_output_tokens: 2048,
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

    const messages = structuredClone(songPrompt);

    messages.push({
      role: "user",
      content: [
        {
          type: "input_text",
          text: `Prompt para generar la cancion titulada "${title}" : ${prompt}. (Solo debes retornar la letra, no el titulo)`
        }
      ]
    })

    const responseResult = await this.openAI.responses.create({
      model: 'gpt-4.1-mini',
      input: messages,
      temperature: 1,
      max_output_tokens: 2048,
      top_p: 1,
      store: true
    });

    return responseResult.output_text;
  }


}

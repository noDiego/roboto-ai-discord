import OpenAI from 'openai';
import {CONFIG} from '../config';
import logger from '../logger';
import {AIConfig} from '../interfaces/ai-interfaces';
import Roboto from '../roboto';
import {BotInput} from '../interfaces/discord-interfaces';
import {Stream} from "openai/streaming";
import {ResponseInput, Tool} from "openai/src/resources/responses/responses";

export class OpenAIService {
  private openAI: OpenAI;

  constructor() {
    const config: AIConfig = CONFIG.AIParams.OPENAI;
    this.openAI = new OpenAI({
      apiKey: config.apiKey
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
      model: CONFIG.AIParams.OPENAI.chatModel,
      input: messageList,
      text: {
        format: {
          type: responseType
        }
      },
      reasoning: {},
      tools: tools,
      temperature: 1,
      max_output_tokens: 2048,
      top_p: 1,
      store: true
    });

    logger.debug('[OpenAI] Completion Response:' + JSON.stringify(responseResult.output_text));

    const messageResult = responseResult.output_text;

    const functionCalls = responseResult.output.filter(toolCall => toolCall.type === "function_call");
    if (functionCalls.length === 0)
      return messageResult;

    let updatedMessages: ResponseInput = [...messageList as any];

    for (const toolCall of responseResult.output) {
      if (toolCall.type !== "function_call") {
        continue;
      }

      updatedMessages.push(toolCall);

      const name = toolCall.name;
      const args = JSON.parse(toolCall.arguments);

      try {
        const result = await Roboto.executeFunctions(name, args, inputData);
        updatedMessages.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: result.toString()
        });
      }catch (error) {
        logger.error(`Error executing function ${name}:`, error);
        updatedMessages.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: `Error executing function ${name}.`
        });
      }
    }

    // Recursive call with updated messages
    return this.sendChatWithTools(updatedMessages, responseType, inputData, tools);
  }

  /**
   * Generates speech audio from provided text by utilizing OpenAI's Text-to-Speech (TTS) API.
   * This function translates text into spoken words in an audio format. It offers a way to convert written messages into audio, providing an audible version of the text content.
   * If a specific voice model is specified in the configuration, the generated speech will use that voice.
   *
   * Parameters:
   * - message: A string containing the text to be converted into speech. This text serves as the input for the TTS engine.
   *
   * Returns:
   * - A promise that resolves to a buffer containing the audio data in MP3 format. This buffer can be played back or sent as an audio message.
   */
  async speech(message, responseFormat?) {

    logger.debug(`[OpenAI->speech] Creating speech audio for: "${message}"`);

    const response: any = await this.openAI.audio.speech.create({
      model: CONFIG.AIParams.OPENAI.speechModel,
      voice: CONFIG.AIParams.OPENAI.speechVoice as any,
      input: message,
      response_format: responseFormat || 'mp3'
    });

    logger.debug(`[OpenAI->speech] Audio Creation OK`);

    return Buffer.from(await response.arrayBuffer());
  }

  async speechStream(message: string, responseFormat: 'mp3' | 'opus' | 'aac' | 'flac' = 'mp3') {
    logger.debug(`[OpenAI->speechStream] Creating streamed speech audio for: "${message}"`);

    const response = await this.openAI.audio.speech.create({
      model: CONFIG.AIParams.OPENAI.speechModel,
      voice: CONFIG.AIParams.OPENAI.speechVoice as any,
      input: message,
      response_format: responseFormat,
    }, { stream: true });

    logger.debug(`[OpenAI->speechStream] Stream ready`);
    return response as any as Stream<any>;
  }


}

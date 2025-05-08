import { Readable } from 'stream';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import logger from '../logger';
import { CONFIG } from '../config';

export class ElevenLabsService {
    private readonly apiKey: string;
    private readonly baseUrl: string = 'https://api.elevenlabs.io/v1/text-to-speech';

    constructor() {
        this.apiKey = CONFIG.ELEVENLABS.apiKey;
    }

    private getHeaders(): Record<string, string> {
        return {
            accept: 'audio/mpeg',
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
        };
    }

    private getBody(msg: string, model?: string) {
        return {
            text: msg,
            model_id: model || CONFIG.ELEVENLABS.speechModel,
            voice_settings: {
                stability: 0.7,
                similarity_boost: 0.8,
                style: 0.25,
                use_speaker_boost: true,
            },
        };
    }

    private async makeRequest(
        msg: string,
        voice: string,
        model?: string,
        responseType?: 'stream' | 'arraybuffer'
    ): Promise<any> {
        const url = `${this.baseUrl}/${voice ?? CONFIG.ELEVENLABS.speechVoice}/stream`;
        const voiceModel = model ?? CONFIG.ELEVENLABS.speechModel;
        const options: AxiosRequestConfig = {
            method: 'POST',
            url,
            headers: this.getHeaders(),
            data: this.getBody(msg, voiceModel),
            responseType,
        };
        try {
            const response: AxiosResponse = await axios(options);
            return response.data;
        } catch (error) {
            logger.error(error);
            throw error;
        }
    }

    async ttsStream(msg: string, voice: string, model?: string): Promise<Readable> {
        return await this.makeRequest(msg,voice, model, 'stream') as Promise<Readable>;
    }

    async tts(msg: string, voice: string, model?: string): Promise<Buffer> {
        const data = await this.makeRequest(msg, voice, model, 'arraybuffer');
        return Buffer.from(data);
    }
}

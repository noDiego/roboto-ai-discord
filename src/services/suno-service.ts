import axios, { AxiosInstance } from 'axios';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { getAudioStream, sleep } from '../utils';
import { CONFIG } from '../config';
import logger from "../logger";
import { CallbackData, SunoDataItem, SunoStatusResponse, TaskStatus } from "../interfaces/sunoapi/suno-response";
import express from "express";
import { ActionResult } from "../interfaces/action-result";
import * as trace_events from "node:trace_events";

const generatedMusicFolder = path.join(process.cwd(), 'generated_music');

export interface GenerateMusicOptions {
    prompt: string; // prompt to generate music, if customMode true, this will be the custom lyrics
    title: string;
    customMode?: boolean;
    instrumental?: boolean;
    style?: string;
    model?: 'V3_5' | 'V4' | 'V4_5';
    negativeTags?: string;
}

export class SunoService {
    private client: AxiosInstance;
    // private activeSongs: Map<string, SunoDataDetails> = new Map();

    constructor() {
        this.client = axios.create({
            baseURL: CONFIG.SUNO.baseURL,
            headers: {
                Authorization: `Bearer ${CONFIG.SUNO.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        fsPromises.mkdir(generatedMusicFolder, { recursive: true }).catch(console.error);
    }

    public async startMusicGeneration(styles: string, lyricData: any, test = false): Promise<string> {
        logger.info(`[Suno] Iniciando creacion de cancion "${lyricData.title}"`);
        try {
            const body: any = test ? {
                    "prompt": "A calm and relaxing piano track with soft melodies",
                    "customMode": false,
                    "instrumental": false,
                    "model": "V3_5",
                    "callBackUrl": "https://api.example.com/callback"
                } :
                {
                    title: lyricData.title,
                    prompt: lyricData.lyrics,
                    styles: styles,
                    customMode: true,
                    instrumental: false,
                    model: 'V4_5',
                    callBackUrl: 'https://api.example.com/callback'
                };

            const kick = await this.client.post('/api/v1/generate', body);
            if (kick.status !== 200 || !kick.data.data?.taskId) {
                logger.error(`[Suno] API error: ${JSON.stringify(kick.data)}`);
                return null;
            }

            logger.info(`[Suno] Esperando proceso completado. taskId: "${kick.data.data.taskId}"`);
            return kick.data.data.taskId;

        } catch (e: any) {
            logger.error("[Suno] Error starting music generation: " + e.message);
            return null;
        }
    }

    public async waitSongsStream(taskId: string): Promise<ActionResult<SunoDataItem[]>> {
        const interval = 3000;
        const timeoutMs = 120_000;

        let timeoutHandle: NodeJS.Timeout;

        const timeoutPromise = new Promise<ActionResult<SunoDataItem[]>>(resolve => {
            timeoutHandle = setTimeout(() => {
                logger.error(`[Suno] Timeout de 2 minutos esperando streaming`);
                resolve({ success: false, code: -1, message: 'Timeout esperando respuesta', data: null });
            }, timeoutMs);
        });

        const pollingPromise = (async () => {
            while (true) {
                const result = await this.updateSongStatus(taskId);
                if ((result.code == 0 && !!result.data) || !result.success) {
                    logger.debug(`[Suno] Respuesta recibida: ${JSON.stringify(result.data)}`);
                    clearTimeout(timeoutHandle);
                    return result;
                }
                await sleep(interval);
            }
        })();

        return Promise.race([pollingPromise, timeoutPromise]);
    }

    public async waitSongsMP3(taskId: string): Promise<ActionResult<SunoDataItem[]>> {
        const interval = 5000;
        const timeoutMs = 300_000;

        let timeoutHandle: NodeJS.Timeout;

        const timeoutPromise = new Promise<ActionResult<SunoDataItem[]>>(resolve => {
            timeoutHandle = setTimeout(() => {
                logger.error(`[Suno] Timeout de 5 minutos esperando MP3`);
                resolve({ success: false, code: -1, message: 'Timeout esperando respuesta', data: null });
            }, timeoutMs);
        });

        const pollingPromise = (async () => {
            while (true) {
                const result = await this.updateSongStatus(taskId);
                if (
                    (result.code == 0 && !!result.data && result.data[0].audioUrl && result.data[1].audioUrl)
                    || !result.success
                ) {
                    logger.debug(`[Suno] Ruta MP3s recibidas: ${JSON.stringify(result.data)}`);
                    clearTimeout(timeoutHandle);
                    return result;
                }
                await sleep(interval);
            }
        })();

        return Promise.race([pollingPromise, timeoutPromise]);
    }

    private async updateSongStatus(taskId: string): Promise<ActionResult<SunoDataItem[]>> {
        const axiosResponse =
            await this.client.get<SunoStatusResponse>('/api/v1/generate/record-info', {params: { taskId : taskId }});
        const response = axiosResponse.data;
        const data = response.data;
        const status = response.data.status;

        if(status == TaskStatus.SENSITIVE_WORD_ERROR)
            return { success: false, error: `${status}: ${data.errorMessage}`, code: -2 }
        if(status == TaskStatus.CALLBACK_EXCEPTION || status == TaskStatus.CREATE_TASK_FAILED || status == TaskStatus.GENERATE_AUDIO_FAILED)
            return { success: false, error: `${status}: ${data.errorMessage}`, code: -1 }

        if(data.taskId != taskId || !data.response?.sunoData )
            return { success: true, code: 1, data: undefined, message: 'Still waiting...' };

        return { success: true, code: 0, data: data.response.sunoData }
    }
}

export const songService = new SunoService();
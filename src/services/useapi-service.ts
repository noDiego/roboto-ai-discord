// src/services/useapi-service.ts

import axios, { AxiosInstance } from 'axios'
import { Readable } from 'stream'
import { CONFIG } from '../config'
import logger from '../logger'

export interface UseAPIGenerateOptions {
    account?: string            // Opcional, tu cuenta Mureka
    lyrics: string              // Letra de la canción (máx. 2000 chars)
    title?: string              // Título de la canción (máx. 50 chars)
    desc?: string               // Géneros, moods, vocals (pop, happy, female vocal…)
    vocal_id?: string           // ID de la voz (si quieres voz específica)
    ref_id?: string             // ID de referencia de pista
    motif_id?: string           // ID de motif (melodía)
    model?: 'V5.5' | 'V6' | 'O1' // Modelo a usar (por defecto V6)
}

export class UseAPIService {
    private client: AxiosInstance

    constructor() {
        this.client = axios.create({
            baseURL: 'https://api.useapi.net',
            headers: {
                Authorization: `Bearer ${CONFIG.USEAPI.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120_000
        })
    }

    /**
     * Llama a Mureka para generar la canción y devuelve un Readable stream del MP3.
     */
    async generateSongStream(opts: UseAPIGenerateOptions): Promise<{data: Readable, urls: string[]}> {
        // Construyo el payload con sólo los campos presentes
        const payload: any = { lyrics: opts.lyrics }
        if (opts.account)   payload.account   = opts.account
        if (opts.title)     payload.title     = opts.title
        if (opts.desc)      payload.desc      = opts.desc
        if (opts.vocal_id)  payload.vocal_id  = opts.vocal_id
        if (opts.ref_id)    payload.ref_id    = opts.ref_id
        if (opts.motif_id)  payload.motif_id  = opts.motif_id
        if (opts.model)     payload.model     = opts.model

        try {
            // 1) Solicito la generación
            const resp = await this.client.post('/v1/mureka/music/create-advanced', payload)
            const songs = resp.data.songs as Array<{ mp3_url: string }>
            if (!songs || songs.length === 0) {
                throw new Error('UseAPI returned no songs')
            }

            // 2) Tomo la primera versión y lo fetch-eo como stream
            const mp3Url = songs[0].mp3_url
            logger.info(`[UseAPIService] Song generated, fetching MP3: ${mp3Url}`)
            const mp3Resp = await axios.get<Readable>(mp3Url, { responseType: 'stream' })
            return { data: mp3Resp.data, urls:[songs[0].mp3_url, songs[1].mp3_url] }

        } catch (e: any) {
            logger.error(`[UseAPIService] Error generating song: ${e.message}`)
            throw e
        }
    }
}

/**
 * Instancia singleton para inyectar en Roboto, etc.
 */
export const useAPIService = new UseAPIService()
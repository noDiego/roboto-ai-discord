import { MusicProvider, SongInfo } from "../interfaces/guild-data";
import path from "node:path";
import logger from "../logger";
import { readFileSync } from "fs";
import { Readable } from "stream";
import Roboto from "../roboto";
import { BotInput } from "../interfaces/discord-interfaces";
import { ActionResult } from "../interfaces/action-result";
import { PostgresClient } from "../db/postgresql";
import { error, query } from "winston";

const corvoFolder = __dirname + "/../../assets/corvo/";

class CorvoSvc {

    private _corvoSongs: CorvoSong[];
    private dbSvc: PostgresClient;

    constructor() {
        this.dbSvc = new PostgresClient();
        this.loadSongs().then(()=>{
            logger.info('Corvo Songs Loaded');
        })
    }

    get corvoSongs(): CorvoSong[] {
        return this._corvoSongs;
    }

    async loadSongs(){
        const dbSongs = await this.dbSvc.getCorvoSongs();

        // 1. Obtén la lista de archivos mp3 del corvoFolder
        const fs = await import('fs/promises'); // usa async fs para promesas
        const files = await fs.readdir(corvoFolder);
        const mp3Files = files.filter(file => file.endsWith('.mp3'));

        // Para almacenar los que quedan al final
        const validSongs: CorvoSong[] = [];

        for (const sng of dbSongs) {
            const baseName = sng.song_name?.trim() ?? '';

            const matchingFile = mp3Files.find(f =>
                normalizeQuery(f.replace('.mp3','')).includes(normalizeQuery(baseName))
                || normalizeQuery(baseName).includes(normalizeQuery(f.replace('.mp3','')))
            );

            if (matchingFile) {
                const fileBaseName = path.basename(matchingFile, '.mp3');

                if (fileBaseName !== baseName) { // Si el nombre no coincide EXACTO, pero hay coincidencia, actualizamos título
                    sng.song_name = fileBaseName;
                }

                validSongs.push(sng);
            } else {
                logger.info(`No se encontró canción "${baseName}" (no se encontró el archivo mp3 asociado)`);
            }
        }

        // Actualiza el arreglo local
        this._corvoSongs = validSongs;
    }

    searchCorvoSong(query: string): SongInfo[]{
        const corvoSong = this._corvoSongs.find(c => normalizeQuery(c.song_name).includes(normalizeQuery(query)) || normalizeQuery(c.song_description).includes(normalizeQuery(query)))
        if (!corvoSong) return [];
        else {
            return [{
                provider: MusicProvider.CORVO,
                title: corvoSong.song_name,
                thumbnail: corvoSong.song_thumbnail || 'https://media.discordapp.net/attachments/912074130407456858/1369372600320393256/image.jpg?ex=681e421d&is=681cf09d&hm=9dcda4ae8008c8d4da0e124ab4041b0939167524225aa1907eec14b260118661&=&format=webp&width=1320&height=880'
            }];
        }
    }

    async startCorvoPlayback(input: BotInput, song: SongInfo): Promise<ActionResult> {

        let lastError = null;

        const pathNormalized = path.normalize(corvoFolder + song.title + ".mp3");
        try {
            const readedFile = readFileSync(pathNormalized);
            const readableFile = Readable.from(readedFile);
            await Roboto.discordService.playAudio(input, readableFile);
            logger.info("[startMP3Playback] Playing: " + song.title);
            return {success: true, code: 0, data: song.title};
        } catch (error: any) {
            logger.debug(`[ERROR] ${error.message}`);
            lastError = error;
        }

        logger.error(`[startMP3Playback] Error playing MP3: ${lastError?.message}`);
        return {success: false, error: lastError, code: -1};
    }


}

export function normalizeQuery(query: string): string {
    const text = query.toLowerCase();
    const acentos = {
        'á': 'a', 'Á': 'A',
        'é': 'e', 'É': 'E',
        'í': 'i', 'Í': 'I',
        'ó': 'o', 'Ó': 'O',
        'ú': 'u', 'Ú': 'U'
    };
    return text.replace(/[áÁéÉíÍóÓúÚ]/g, function(match) {
        return acentos[match];
    });
}

export interface CorvoSong {
    id?: number;
    song_name?: string;
    song_description?: string;
    song_lyrics?: string;
    enabled?: boolean;
    song_author?: string;
    song_genres?: string;
    song_url?: string;
    song_thumbnail?: string;
}

export const CorvoService = new CorvoSvc();
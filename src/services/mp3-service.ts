import { MusicProvider, SongInfo } from "../interfaces/guild-data";
import path from "node:path";
import logger from "../logger";
import * as fs from "node:fs";
import { readFileSync } from "fs";
import { Readable } from "stream";
import Roboto from "../roboto";
import { BotInput } from "../interfaces/discord-interfaces";
import { ActionResult } from "../interfaces/action-result";

const mp3Folder = __dirname + "/../../assets/mp3/";

export function searchMP3(query: string): SongInfo[]{
    const mp3File = findAudioFile(query);
    if (!mp3File) return [];
    else {
        return [{
            provider: MusicProvider.MP3,
            title: path.basename(mp3File).replace('.mp3',''),
        }];
    }

}

export async function startMP3Playback(input: BotInput, song: SongInfo): Promise<ActionResult> {
    const pathNormalized = path.normalize(mp3Folder + song.title + ".mp3");
    try {
        const readedFile = readFileSync(pathNormalized);
        const readableFile = Readable.from(readedFile);
        await Roboto.discordService.playAudio(input, readableFile);
        logger.info("[startMP3Playback] Playing: " + song.title);
    }catch (error: any) {
        logger.error(`[startMP3Playback] Error playing MP3: ${error.message}`);
        return { success: false, error: error, code: -1};
    }
    return { success: true, code: 0, result: song.title };
}

function findAudioFile(searchTerm: string): string | null {
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();

    try {
        const files = fs.readdirSync(mp3Folder);

        const exactMatch = files.find(file =>
            path.parse(file).name.toLowerCase() === normalizedSearchTerm
        );

        if (exactMatch) return path.normalize(path.join(mp3Folder, exactMatch));

        const partialMatch = files.find(file =>
            path.parse(file).name.toLowerCase().includes(normalizedSearchTerm)
        );

        if (partialMatch) return path.normalize(path.join(mp3Folder, partialMatch));

        return null;
    } catch (error) {
        logger.error(`[findAudioFile] Error while searching for audio file: ${error.message}`);
        return null;
    }
}

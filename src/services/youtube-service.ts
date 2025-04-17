import logger from '../logger';
import { CONFIG } from '../config';
import Roboto from '../roboto';
import { MusicProvider, SongInfo } from '../interfaces/guild-data';
import { BotInput } from '../interfaces/discord-interfaces';
import { ActionResult } from '../interfaces/action-result';
import {promises as fsPromises, readFileSync} from 'fs';
import youtubedl, {Payload} from "youtube-dl-exec";
import {join} from "path";
import {Readable} from "stream";
import { youtube } from 'scrape-youtube';
import ytstream from 'yt-stream';
import {cleanFileName, sleep} from "../utils";
import { promises as fs } from 'fs';

export default class YoutubeService {

  private tempDir: string;

  constructor() {
    this.tempDir = CONFIG.Youtube.tempDir;
    this.cleanTempFiles();
    setInterval(()=> this.cleanTempFiles, 60 * 60 * 1000);
  }

  public async startYTPlayback(input: BotInput, song: SongInfo): Promise<ActionResult> {

    logger.debug('Playing: ' + song.title);

    try {
      const stream = await this.getYoutubeStream(song);
      if (!stream || !stream.stream) {
        logger.error('[startYTPlayback] Error with youtube stream');
        return { success: false, error: `Error trying to reproduce ${song.title}`, code: 1};
      }

      await Roboto.discordService.playAudio(input, stream.stream);

      return { success: true, code: 0, result: song.title };
    } catch (error: any) {
      if(error.includes('Sign in to confirm'))
        return { success: false, error: error, code: -100};
      logger.error(`[startYTPlayback] Error: ${error}`);
      return { success: false, error: error, code: -1};
    }
  }

  private async getYoutubeStream(song: SongInfo) {
    const tmpFile = join(this.tempDir, `${cleanFileName(song.title)}`);

    try {
      await fsPromises.access(tmpFile+'.opus', fsPromises.constants.F_OK);
      logger.debug(`[YoutubeService] File already exists: ${tmpFile}.opus`);
      const readedFile = readFileSync(tmpFile+'.opus');
      return {stream: Readable.from(readedFile)};
    } catch (error) {
      logger.debug(`[YoutubeService] File does not exist, downloading: ${song.url}`);
    }

    const downloadProcess = youtubedl.exec(song.url, {
      extractAudio: true,
      audioQuality: 0,
      output: tmpFile,
      noWarnings: true,
      callHome: false,
      youtubeSkipDashManifest: true,
      noCheckCertificates: true,
    });

    await downloadProcess;
    logger.debug(`[YoutubeService] Download completed: ${tmpFile+'.opus'}`);
    await sleep(300);

    const readedFile = readFileSync(tmpFile+'.opus');

    return {stream: Readable.from(readedFile)};
  }

  public async search(searchTerm: string): Promise<SongInfo[]> {
    const results: SongInfo[] = [];

    try {
      if (ytstream.validateURL(searchTerm)) {
        const isPlaylist = searchTerm.includes('list=');

        if (isPlaylist) {
          const playlistInfo: any = await youtubedl(searchTerm, {
            dumpSingleJson: true,
            flatPlaylist: true,
            skipDownload: true,
            simulate: true,
            noWarnings: true,
            callHome: false,
            youtubeSkipDashManifest: true,
            noCheckCertificates: true
          }) as Payload;

          if (playlistInfo.entries && Array.isArray(playlistInfo.entries)) {
            for (const entry of playlistInfo.entries) {
              results.push({
                provider: MusicProvider.YOUTUBE,
                title: entry.title,
                url: entry.webpage_url || entry.url,
                thumbnail: entry.thumbnail,
                duration: entry.duration_string || String(entry.duration),
              });
            }
          } else {
            results.push({
              provider: MusicProvider.YOUTUBE,
              title: playlistInfo.title,
              url: playlistInfo.webpage_url || searchTerm,
              thumbnail: playlistInfo.thumbnail,
              duration: playlistInfo.duration_string || String(playlistInfo.duration),
            });
          }
        } else {
          const info = await youtubedl(searchTerm, {
            dumpSingleJson: true,
            skipDownload: true,
            simulate: true,
            noWarnings: true,
            callHome: false,
            youtubeSkipDashManifest: true,
            noCheckCertificates: true
          }) as Payload;

          results.push({
            provider: MusicProvider.YOUTUBE,
            title: info.title,
            url: info.webpage_url || searchTerm,
            thumbnail: info.thumbnail,
            duration: info.duration_string || String(info.duration),
          });
        }
      } else {
        const searchResponse = await youtube.search(searchTerm);
        if (searchResponse.videos.length === 0) return [];

        const firstResult = searchResponse.videos[0];

        results.push({
          provider: MusicProvider.YOUTUBE,
          title: firstResult.title,
          url: firstResult.link,
          thumbnail: firstResult.thumbnail,
          duration: String(firstResult.duration),
        });
      }

    } catch (error) {
      logger.error(`[YoutubeService] Error fetching YouTube results: ${error}`);
      return [];
    }

    return results;
  }

  private async cleanTempFiles() {

    try {
      const files = await fs.readdir(CONFIG.Youtube.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = join(CONFIG.Youtube.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.atimeMs > CONFIG.Youtube.maxAgeMs) {
            await fs.unlink(filePath);
            logger.debug(`Removing "${filePath}" due to inactivity`);
          }
        } catch (error) {
          logger.error(`Error processing the file ${filePath}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error reading the temporary directory: ${error.message}`);
    }
  }

}

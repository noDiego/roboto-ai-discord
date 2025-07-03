import logger from '../logger';
import { CONFIG } from '../config';
import Roboto from '../roboto';
import { MusicProvider, SongInfo } from '../interfaces/guild-data';
import { BotInput } from '../interfaces/discord-interfaces';
import { ActionResult } from '../interfaces/action-result';
import { promises as fsPromises, promises as fs, readFileSync } from 'fs';
import youtubedl, { Payload } from "youtube-dl-exec";
import { join } from "path";
import { Readable } from "stream";
import { youtube } from 'scrape-youtube';
import ytstream from 'yt-stream';
import { cleanFileName, normalizeYouTubeURL, sleep } from "../utils";

export default class YoutubeService {

  private tempDir: string;
  private static readonly SUPPORTED_EXTENSIONS = ['opus', 'm4a', 'webm', 'mp3'];

  constructor() {
    this.tempDir = CONFIG.Youtube.tempDir;
    this.cleanTempFiles();
    setInterval(()=> this.cleanTempFiles(), 60 * 60 * 1000);
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

      return { success: true, code: 0, data: song.title };
    } catch (error: any) {
      if(error.includes('Sign in to confirm'))
        return { success: false, error: error, code: -100};
      logger.error(`[startYTPlayback] Error: ${error}`);
      return { success: false, error: error, code: -1};
    }
  }

  private async getYoutubeStream(song: SongInfo) {
    const tmpFile = join(this.tempDir, `${cleanFileName(song.title)}`);
    let foundPath: string | null = null;

    // 1. Check if something has already been downloaded before
    for (const ext of YoutubeService.SUPPORTED_EXTENSIONS) {
      const testPath = `${tmpFile}.${ext}`;
      try {
        await fsPromises.access(testPath, fsPromises.constants.F_OK);
        foundPath = testPath;
        logger.debug(`[YoutubeService] File already exists: ${testPath}`);
        break;
      } catch {}
    }

    if (!foundPath) {
      // 2. Download (the .output does NOT have an extension, so add your own suffix)
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

      // 3. Identify the actual extension generated after the download
      for (const ext of YoutubeService.SUPPORTED_EXTENSIONS) {
        const testPath = `${tmpFile}.${ext}`;
        try {
          await fsPromises.access(testPath, fsPromises.constants.F_OK);
          foundPath = testPath;
          logger.debug(`[YoutubeService] Download completed: ${testPath}`);
          break;
        } catch {}
      }

      if (!foundPath) {
        logger.error("[YoutubeService] Audio file not found after download!");
        return {stream: null};
      }

      await sleep(300);
    }

    const readedFile = readFileSync(foundPath);
    return {stream: Readable.from(readedFile)};
  }

  public async search(searchTerm: string, isPlaylist = false): Promise<SongInfo[]> {
    try {
      if (ytstream.validateURL(searchTerm)) {
        const normalizedYTUrl = normalizeYouTubeURL(searchTerm);
        return this.handleYouTubeUrl(isPlaylist? normalizedYTUrl:normalizedYTUrl.split('&list')[0], isPlaylist);
      }
      return this.searchYouTubeVideos(searchTerm);
    } catch (error) {
      logger.error(`[YoutubeService] Error fetching YouTube results: ${error}`);
      return [];
    }
  }

  private async handleYouTubeUrl(url: string, isPlaylist = false): Promise<SongInfo[]> {
    if (isPlaylist) return this.handlePlaylist(url);
    return this.handleSingleVideo(url);
  }

  private async handlePlaylist(url: string): Promise<SongInfo[]> {
    const results: SongInfo[] = [];
    const playlistInfo: any = await youtubedl(url, {
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      simulate: true,
      noWarnings: true,
      callHome: false,
      youtubeSkipDashManifest: true,
      noCheckCertificates: true,
      cookies: CONFIG.Youtube.cookies
    }) as Payload;

    if (playlistInfo.entries && Array.isArray(playlistInfo.entries)) {
      for (const entry of playlistInfo.entries) {
        results.push(this.createSongInfo(entry));
      }
    } else {
      results.push(this.createSongInfo(playlistInfo, url));
    }

    const seen = new Set<string>();
    const uniqueResults = results.filter(song => {
      if (seen.has(song.url)) return false;
      seen.add(song.url);
      return true;
    });

    return uniqueResults;
  }

  private async handleSingleVideo(url: string): Promise<SongInfo[]> {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      skipDownload: true,
      simulate: true,
      noWarnings: true,
      callHome: false,
      youtubeSkipDashManifest: true,
      noCheckCertificates: true,
      cookies: CONFIG.Youtube.cookies
    }) as Payload;

    return [this.createSongInfo(info, url)];
  }

  private async searchYouTubeVideos(searchTerm: string): Promise<SongInfo[]> {
    const searchResponse = await youtube.search(searchTerm);
    let videos = searchResponse.videos.slice(0,10);
    if (videos.length === 0) return [];

    return videos.map(result => ({
      provider: MusicProvider.YOUTUBE,
      title: result.title,
      url: result.link,
      thumbnail: result.thumbnail,
      duration: String(result.duration),
    }));
  }

  private createSongInfo(info: any, fallbackUrl?: string): SongInfo {
    return {
      provider: MusicProvider.YOUTUBE,
      title: info.title,
      url: info.webpage_url || info.url || fallbackUrl || '',
      thumbnail: info.thumbnail || info.thumbnails? info.thumbnails[0]?.url : 'No URL Found',
      duration: info.duration_string || String(info.duration),
    };
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

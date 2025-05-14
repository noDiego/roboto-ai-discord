import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';
import { CONFIG } from './index';

const GUILDCONFIG_FILE = path.join(process.cwd(), 'guild-configurations.json');

export interface GuildConfiguration {
  guildId: string;
  name: string;
  promptInfo: string;
  botName?: string;
  maxMessages?: number;
  ttsProvider?: 'OPENAI' | 'ELEVENLABS';
  imageCreationEnabled?: boolean;
}

type UpdateOptions = Partial<Omit<GuildConfiguration, 'guildId'>>;

class GuildConfig {
  private guildConfigurations: GuildConfiguration[] = [];

  constructor() {
    this.loadGuildConfigs();
  }

  private loadGuildConfigs() {
    try {
      if (fs.existsSync(GUILDCONFIG_FILE)) {
        const data = fs.readFileSync(GUILDCONFIG_FILE, 'utf8');
        this.guildConfigurations = JSON.parse(data);
        logger.info(`Loaded ${this.guildConfigurations.length} guild configurations`);
      } else {
        logger.info('No guild config file found, creating a new one');
        this.guildConfigurations = [];
        this.saveGuildConfig();
      }
    } catch (err: any) {
      logger.error(`Error loading guild configuration: ${err.message}`);
      this.guildConfigurations = [];
      this.saveGuildConfig();
    }
  }

  private saveGuildConfig() {
    try {
      const data = JSON.stringify(this.guildConfigurations, null, 2);
      fs.writeFileSync(GUILDCONFIG_FILE, data, 'utf8');
      logger.info('Guild configs saved successfully');
    } catch (err: any) {
      logger.error(`Error saving guild configs: ${err.message}`);
    }
  }

  /**
   * Returns the configuration for this guild, but with ALL fields
   * guaranteed to be non-undefined, because we fill in defaults
   * from CONFIG when needed.
   */
  public getGuildConfig(guildId: string, guildName?:string): GuildConfiguration {
    const stored = this.guildConfigurations.find(c => c.guildId === guildId);

    const isBlank = <T>(v: T | undefined): v is undefined => v === undefined || v === '';

    return {
      guildId,

      name: !stored || isBlank(stored.name)
          ? guildName || 'Guild'
          : stored.name,

      promptInfo: !stored || isBlank(stored.promptInfo)
          ? CONFIG.defaultPrompt
          : stored.promptInfo,

      botName: !stored || isBlank(stored.botName)
          ? CONFIG.botName
          : stored.botName,

      maxMessages: !stored || isBlank(stored.maxMessages)
          ? CONFIG.maxMessages
          : stored.maxMessages,

      ttsProvider: !stored || isBlank(stored.ttsProvider)
          ? CONFIG.ttsProvider
          : stored.ttsProvider,

      imageCreationEnabled: !stored || typeof stored.imageCreationEnabled !== 'boolean'
          ? Boolean(CONFIG.imageCreationEnabled)
          : stored.imageCreationEnabled,
    };
  }

  /**
   * Create or update a guild config by passing in any subset of fields.
   * Merges:
   *   1) your incoming `options` (highest priority)
   *   2) already‐saved config
   *   3) environment defaults from CONFIG (lowest priority)
   */
  public updateGuildConfig(
      currentConfig: GuildConfiguration,
      options: UpdateOptions,
  ): GuildConfiguration {

    // helper to decide if user explicitly passed something meaningful
    const hasValue = <T>(v: T | undefined): v is T => v !== undefined && v !== '' ;

    const merged: GuildConfiguration = {
      guildId: currentConfig.guildId,

      // 1) options.name, 2) currentConfig.name, 3) CONFIG.appName
      name: hasValue(options.name)
          ? options.name!
          : currentConfig?.name ?? 'Guild',

      promptInfo: hasValue(options.promptInfo)
          ? options.promptInfo!
          : currentConfig?.promptInfo ?? CONFIG.defaultPrompt,

      botName: hasValue(options.botName)
          ? options.botName!
          : currentConfig?.botName ?? CONFIG.botName,

      maxMessages: hasValue(options.maxMessages)
          ? options.maxMessages!
          : currentConfig?.maxMessages ?? CONFIG.maxMessages,

      ttsProvider: hasValue(options.ttsProvider)
          ? options.ttsProvider
          : currentConfig?.ttsProvider ?? CONFIG.ttsProvider as any,

      imageCreationEnabled: options.imageCreationEnabled !== undefined
          ? options.imageCreationEnabled
          : currentConfig?.imageCreationEnabled ?? Boolean(CONFIG.imageCreationEnabled),
    };

    const idx = this.guildConfigurations.findIndex(c => c.guildId === currentConfig.guildId);
    if (idx !== -1) {
      this.guildConfigurations[idx] = merged;
    } else {
      this.guildConfigurations.push(merged);
    }
    this.saveGuildConfig();
    logger.info(`Updated configuration for guild "${currentConfig.guildId}"`);

    return merged;
  }

  public removeGuildConfig(guildId: string): boolean {
    const before = this.guildConfigurations.length;
    this.guildConfigurations = this.guildConfigurations.filter(c => c.guildId !== guildId);
    const removed = this.guildConfigurations.length < before;
    if (removed) {
      this.saveGuildConfig();
      logger.info(`Removed configuration for guild "${guildId}"`);
    }
    return removed;
  }

  public listGuildConfigurations(): GuildConfiguration[] {
    return this.guildConfigurations.map(c => this.getGuildConfig(c.guildId)!);
  }
}

export const guildConfigurationManager = new GuildConfig();
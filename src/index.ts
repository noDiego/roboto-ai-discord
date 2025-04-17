import { Client, GatewayIntentBits } from "discord.js";
import { deployCommands } from './deploy-commands';
import { commands } from './commands';
import { CONFIG } from './config';
import logger from './logger';
import Roboto from './roboto';

const client = new Client({
  intents: [  GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates],
});

client.once("ready", async () => {
  logger.info("Discord bot is ready!");
  await deployCommands({ guildId: process.env.TEST_GUILD_ID!}); //TODO: REMOVE
});

client.on("guildCreate", async (guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on("interactionCreate", async (interaction) => {
  return await Roboto.handleInteraction(interaction);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  return await Roboto.handleMessage(message);
});

client.login(CONFIG.botToken);

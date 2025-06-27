import { Client, GatewayIntentBits } from "discord.js";
import { deployCommands } from './deploy-commands';
import { CONFIG } from './config';
import logger from './logger';
import Roboto from './roboto';
import { fechaHoraChilena, handleInteractionError } from "./utils";
import YoutubeService from "./services/youtube-service";

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
  try {
    return await Roboto.handleInteraction(interaction);
  }catch (e){
    return handleInteractionError(interaction, e);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  return await Roboto.handleMessage(message);
});

client.login(CONFIG.botToken);


async function test(){
  console.log(fechaHoraChilena());
}

test();
import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicProvider, SongInfo } from "../interfaces/guild-data";
import Roboto from "../roboto";
import { CorvoService } from "../services/corvo-service";

export const data = new SlashCommandBuilder()
    .setName("corvofull")
    .setDescription("Escucha todas las Corvo cancionestianes");

export async function execute(interaction: CommandInteraction) {
  await interaction.deferReply();
  let songList: SongInfo[] = CorvoService.corvoSongs.map(song => {
     return {
       provider: MusicProvider.CORVO,
       title: song.song_name,
       thumbnail: song.song_thumbnail || 'https://media.discordapp.net/attachments/912074130407456858/1369372600320393256/image.jpg?ex=681e421d&is=681cf09d&hm=9dcda4ae8008c8d4da0e124ab4041b0939167524225aa1907eec14b260118661&=&format=webp&width=1320&height=880',
     }
  });

  songList = shuffleArray(songList);

  const addResult = await Roboto.musicService.addToQueue(interaction, songList);
  if(addResult.success && addResult.code == 11)
      await Roboto.musicService.startPlayback(interaction);


  return interaction.editReply('Agregados todos los temitas de Corvo Team 🎶');
}

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
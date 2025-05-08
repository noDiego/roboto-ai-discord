export default {
  responses: {
    thinking: "Thinking...",
    noresults: "No results were found for {{query}}",
    addedToQueue: "Added to the queue: \"{{title}}\"{{extra}}",
    andMore: " and {{count}} more songs.",
    nowPlaying: "Playing: \"{{title}}\".",
    errorPlaying: "Error playing: \"{{title}}\". {{error}}",
    error: "An error occurred",
  },
  music: {
    pause: "Pause",
    play: "Play",
    stop: "Stop",
    skip: "Skip",
  },
  commands: {
    image: {
      description: "Generates an image with the received instruction",
      promptDescription: "The instruction for the AI to generate or edit an image"
    },
    youtube: {
      description: "Searches and plays a song on YouTube",
      queryDescription: "The link or query to find a song"
    },
    list: {
      description: "Search and play a song on YouTube",
      title: "Playlist",
      emptyMsg: "The playlist is empty"
    },
    stop: {
      description: "Stops music playback and clears the playlist",
      response: "* Music was stopped by **{{name}}**"
    },
    skip: {
      description: "Skips the current song to listen to the next one in the list",
      response: '* **{{name}}** skipped the song "{{title}}"'
    },
    pause: {
      description: "Pauses the current music playback",
      response: "* **{{name}}** paused the music playback"
    },
    resume: {
      description: "Resumes the current music playback",
      response: "* **{{name}}** resumed the music playback"
    },
    config: {
      description: "Configure specific parameters for this server",
      options: {
        name: "Friendly name for this server",
        promptinfo: "Custom system prompt for the AI",
        botname: "Name the bot will display in its responses",
        maxmessages: "Maximum recent messages the AI will consider",
        ttsprovider: "TTS provider (voice)",
        imagecreationenabled: "Allow image generation/editing?"
      },
      responses: {
        noGuild: "This command only works inside a server.",
        currentTitle: "Current Configuration",
        updatedTitle: "Configuration Updated ✅"
      },
      fields: {
        name: "Name",
        prompt: "Prompt",
        botName: "Bot Name",
        maxMessages: "Max Messages",
        ttsProvider: "TTS Provider",
        imageCreation: "Image Creation"
      }
    }
  }
};

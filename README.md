# Roboto AI - An Intelligent Discord Bot

[![Discord](https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

Roboto AI is a versatile Discord bot powered by AI that provides a natural conversational experience. It's designed to understand your server context, respond to messages, play music, generate images, and more.

## 🌟 Key Features

- **Natural Conversation**: Simply mention Roboto by name to start a conversation
- **Music Playback**: Search and play music from YouTube or local MP3s
- **Image Generation**: Create and edit images with natural language instructions
- **Voice Responses**: Ask Roboto to speak using advanced text-to-speech technology
- **Multilingual Support**: Communicate in English, Spanish, or French
- **Server Configuration**: Customize Roboto's behavior for your specific Discord server

## 🔍 How It Works

Unlike traditional command-based bots, Roboto is designed to provide a more natural interaction experience:

- **Just Mention Him**: Call Roboto by his name anywhere in your message and he'll respond
- **Reply to Messages**: Reply to his messages for continued conversation
- **Context-Aware**: He remembers your conversations and maintains context
- **Intelligent Responses**: He'll choose the most appropriate function based on your request

While Roboto supports traditional slash commands, his true power lies in natural conversation. Simply say:

```
Hey Roboto, can you play some relaxing music?
```

And he'll understand what you need without requiring specific command syntax!

## 🛠️ Installation

### Prerequisites
- Node.js (v16.9.0 or higher)
- A Discord account and server with admin privileges
- OpenAI API key

### Setup
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the `.env.example` template
4. Configure your environment variables:
   ```
   BOT_TOKEN=your_discord_bot_token
   BOT_CLIENT_ID=your_bot_client_id
   BOT_NAME=Roboto
   OPENAI_API_KEY=your_openai_api_key
   ```
5. Start the bot:
   ```bash
   npm start
   ```

## ⚙️ Configuration

Roboto can be configured per Discord server using the `/config` command:

| Setting | Description |
|---------|-------------|
| name | Friendly name for the server |
| promptinfo | Custom system prompt with context about your server |
| botname | Name the bot will respond to |
| maxmessages | Maximum recent messages to consider for context |
| ttsprovider | Text-to-speech provider (OpenAI or ElevenLabs) |
| imagecreationenabled | Enable/disable image generation |

### Example Configuration
```
/config name:"Gaming Community" promptinfo:"This is a gaming community focused on FPS games" botname:"Robo" maxmessages:20
```

## 🎵 Music Commands

While you can simply ask Roboto to play music in natural language, these commands are also available:

- `/pl query:` - Search and play music from YouTube
- `/pause` - Pause current playback
- `/resume` - Resume playback
- `/skip` - Skip to next song
- `/stop` - Stop playback and clear playlist
- `/list` - View the current playlist

## 🌐 Language Settings

Change the bot's language using:
```
/language locale:[en|es|fr]
```

## 🖼️ Image Generation

Ask Roboto to create images for you:
```
Roboto, can you create an image of a sunset over the ocean?
```

Or use the command:
```
/image prompt:a futuristic cityscape
```

## 📝 Examples of Natural Interaction

- "Hey Roboto, tell me a joke about programming"
- "Roboto, what's the weather like in New York?"
- "Roboto, play some relaxing music for studying"
- "Can you create an image of a fantasy castle, Roboto?"
- "Roboto, use your voice to tell me a bedtime story"
- "What songs are in the queue, Roboto?"

## 🧩 Advanced Features

- **Memory**: Roboto remembers conversation context within your server
- **Voice Integration**: Roboto can join voice channels to play music or speak
- **Function Selection**: The AI automatically chooses which capability to use based on your request
- **Custom Server Knowledge**: Add specific information about your server through the configuration

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This bot uses AI systems that may occasionally produce unexpected outputs. Always review and moderate content for your community.

---

Built with ❤️ using Discord.js and OpenAI
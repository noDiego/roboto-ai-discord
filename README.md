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
- Node.js (v22 or higher)
- A Discord account and server with admin privileges
- OpenAI API key


### Discord Bot Setup

Before installing and running the bot, you need to create a Discord application and bot user:

1. Go to the Discord Developer Portal (https://discord.com/developers/applications).
2. Click on "New Application" and give your application a name.
3. Go to the "Bot" tab in the left sidebar and click "Add Bot".
4. Customize your bot's name and avatar as desired.
5. Under the "Token" section, click "Copy" to copy your bot token. You'll need this for the config.json file.
6. In the "Privileged Gateway Intents" section, enable "Message Content Intent".
7. Go to the "OAuth2" tab in the left sidebar, then select "URL Generator".
8. In the "Scopes" section, select "bot".
9. In the "Bot Permissions" section, select the permissions your bot needs (at minimum: "Read Messages/View Channels", "Send Messages", and "Read Message History").
10. Copy the generated URL at the bottom of the page.
11. Open this URL in a new tab and select the server you want to add the bot to. You must have the "Manage Server" permission to add bots to a server.

Now your Discord bot is set up and added to your server(s).


### Setup
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the `.env.example` template
4. Edit the `.env` and configure this environment variables:
   ```
   BOT_TOKEN=your_discord_bot_token
   BOT_CLIENT_ID=your_bot_client_id
   BOT_NAME=Roboto
   OPENAI_API_KEY=your_openai_api_key
   ```
   - Replace "your_discord_bot_token" with the token you copied in step 5 of the Discord Bot Setup
   - Replace "your_bot_client_id" with the "Application ID" of your bot (You can find it in the "General Information" section.)
   - Replace "your_openai_api_key" with your OpenAI APIKey ([OpenAI API Keys](https://platform.openai.com/account/api-keys))
   
5. Start the bot:
   ```bash
   npm run start
   ```

## ⚙️ Bot OpenAI Configuration

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

You can ask Roboto to add one or more songs of your choice, and it can also show or edit the playlist:

<img src="https://i.imgur.com/H3ipVHw.jpeg" width="650">

While you can simply ask Roboto to play music in natural language, these commands are also available:

- `/p query:` - Search and play music from YouTube
- `/pause` - Pause current playback
- `/resume` - Resume playback
- `/skip` - Skip to next song
- `/stop` - Stop playback and clear playlist
- `/list` - View the current playlist

## 🎵 Local MP3 Playback

Roboto AI can also play MP3 audio files stored locally on the server. To use this feature, simply place your MP3 files in the `assets/mp3` directory.

When requesting playback, just mention the name of the audio file or be specific by indicating that the track is stored locally. Roboto will automatically search the `assets/mp3` folder and play the matching file if found.

This feature enables you to easily integrate custom audio clips, jingles, or music without relying solely on external streaming services.

## 🌐 Language Settings

Change the bot's language using:
```
/language locale:[en|es|fr]
```

## 🖼️ Image Generation

Ask Roboto to create or edit images for you:

<img src="https://i.imgur.com/qsjRMgz.jpeg" width="650">

Or use the command:
```
/image prompt:a futuristic cityscape
```

## 🗣️ Voice Capability

Roboto doesn’t just respond with text—he can also **speak** to you. When you ask a question or make a request, you can tell him to use his **voice** to reply. This is made possible through advanced text-to-speech (TTS) integration, and you can simply ask him to respond using his voice.


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

## 🔧 Advanced Environment Variables

In addition to the essential environment variables like `BOT_TOKEN`, `BOT_CLIENT_ID`, and `OPENAI_API_KEY`, you can customize Roboto AI further by setting the following optional environment variables:

| Variable                     | Description                                                                                                 | Default                 |
|------------------------------|-------------------------------------------------------------------------------------------------------------|-------------------------|
| `BOT_NAME`                   | The display name of the bot used in responses and prompts                                                   | `"Roboto"`              |
| `BOT_LOCALE`                 | Default language/locale of the bot (`en`, `es`, `fr`)                                                       | `"en"`                  |
| `TTS_PROVIDER`               | Text-to-speech provider to use. Options: `"OPENAI"` or `"ELEVENLABS"`                                       | `"OPENAI"`              |
| `IMAGE_CREATION_ENABLED`     | Enable or disable image generation and editing functionality (`true` or `false`)                            | `false`                 |
| `OPENAI_CHAT_MODEL`          | OpenAI chat model used for conversational AI (`gpt-4.1-mini`, etc.)                                        | `"gpt-4.1-mini"`        |
| `OPENAI_SPEECH_MODEL`        | OpenAI model used for text-to-speech                                                                        | `"gpt-4o-mini-tts"`     |
| `OPENAI_SPEECH_VOICE`        | Default voice name for OpenAI’s speech generation (`fable`, `onyx`, etc.)                                   | `"fable"`               |
| `OPENAI_IMAGE_MODEL`         | OpenAI model used for image generation (`gpt-image-1`, etc.)                                               | `"gpt-image-1"`         |
| `OPENAI_IMAGE_QUALITY`       | Quality setting for generated images (`low`, `medium`, `high`, `auto`)                                     | `"medium"`              |
| `ELEVENLABS_API_KEY`         | API key for ElevenLabs text-to-speech service                                                              | _none_                  |
| `ELEVENLABS_SPEECH_MODEL`    | Voice model for ElevenLabs TTS                                                                              | `"eleven_multilingual_v2"` |
| `ELEVENLABS_SPEECH_VOICEID` | Voice ID for ElevenLabs TTS                                                                                 | `"N2lVS1w4EtoT3dr4eOWO"` |
| `YOUTUBE_MAX_AGEMS`          | The maximum time in milliseconds a downloaded YouTube audio file is kept before deletion (4 hours default) | `14400000` (4 hours)    |
| `YOUTUBE_COOKIES`            | Optional cookie string to be used by the YouTube downloader for accessing restricted content                | _none_                  |

### Notes

- **Enabling image creation** (`IMAGE_CREATION_ENABLED=true`) must be set if you want the bot to generate or edit images with AI.
- When using **ElevenLabs as TTS provider**, make sure `ELEVENLABS_API_KEY` is set; otherwise, OpenAI’s built-in voice is used.
- Customizing the OpenAI models lets you balance cost, speed, and quality to your preferences.
- `YOUTUBE_COOKIES` is necessary if you want to access age-restricted or region-locked YouTube content.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

Roboto AI relies on advanced artificial intelligence models to provide its features and respond to your commands. While it strives to deliver accurate and helpful responses, there may be occasions where the behavior is unexpected, inconsistent, or erratic.

If you notice repeated or problematic behavior patterns, please help us improve the bot by reporting these issues on the project's issue tracker. Your feedback is valuable to make Roboto AI better for everyone.


### Enjoy experimenting with Roboto!
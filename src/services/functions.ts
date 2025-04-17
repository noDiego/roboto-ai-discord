import {Tool} from "openai/src/resources/responses/responses";

export const AITools: Array<Tool> = [
    {
        type: "web_search_preview",
        user_location: {
            type: "approximate"
        },
        search_context_size: "medium"
    },
    {
        type: "function",
        name: "play_youtube_song",
        description: "Plays a YouTube song based on a search or a specific URL.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search term or URL of the music to play."
                }
            },
            required: ["query"],
            additionalProperties: false,
        },
        strict: true
    },
    {
        type: "function",
        name: "play_mp3",
        description: "Search and play a mp3 file from the local storage.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search term of the mp3 file to play."
                }
            },
            required: ["query"],
            additionalProperties: false,
        },
        strict: true
    },
    {
        type: "function",
        name: "get_songs_queue",
        description: "Returns the list of songs in the queue.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "remove_song_from_queue",
        description: "Removes a song from the queue based on title or part of the title.",
        parameters: {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "The title or part of the title of the song to remove."
                }
            },
            required: ["title"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "clear_songs_queue",
        description: "Clears the entire song queue, removing all songs.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "get_current_playing_song",
        description: "Retrieves data about the currently playing song.",
        parameters: {
            type: "object",
            properties: {},
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "control_music_player",
        description: "Controls the music player with specified actions.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["RESUME", "PAUSE", "STOP", "SKIP"],
                    description: "The action to perform on the music player. Options: RESUME, PAUSE, STOP, SKIP."
                }
            },
            required: ["action"],
            additionalProperties: false
        },
        strict: true
    }
];

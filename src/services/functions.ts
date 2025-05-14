import { Tool } from "openai/src/resources/responses/responses";

export const AITools: Array<Tool> = [
    {
        type: "function",
        name: "web_search",
        description: "Use this function whenever the user asks to find out, search for, or obtain updated information or internet data.",
        strict: true,
        parameters: {
            type: "object",
            required: [
                "query"
            ],
            properties: {
                query: {
                    type: "string",
                    description: "Search term to perform the internet search"
                }
            },
            additionalProperties: false
        }
    },
    {
        type: "function",
        name: "search_youtube",
        description: "Searches YouTube and returns up to N music video results matching the query, from which the model can select one or more.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search term or a YouTube URL."
                },
                maxResults: { type: ["integer","null"], description: "Maximum number of videos to return (default 10). OPTIONAL", nullable: true }
            },
            required: ["query", "maxResults"],
            additionalProperties: false,
        },
        strict: true
    },
    {
        type: "function",
        name: "play_youtube_songs",
        description: "Play or adds one or multiple YouTube songs to the playback queue in a single call. Receives an array ‘songs’ with objects { provider, url, title, thumbnail }. The first song will play immediately if nothing is currently playing; the rest will be queued in the given order.",
        parameters: {
            type: "object",
            properties: {
                songs: {
                    type: "array",
                    description: "List of songs to play or enqueue in one request.",
                    items: {
                        type: "object",
                        properties: {
                            provider: {
                                type: "string",
                                description: 'Always must be "YOUTUBE"'
                            },
                            url: {
                                type: "string",
                                description: "YouTube video URL"
                            },
                            title: {
                                type: "string",
                                description: "Song title"
                            },
                            thumbnail: {
                                type: ["string","null"],
                                description: "Thumbnail URL (optional).",
                                nullable: true
                            }
                        },
                        required: ["provider","url", "title","thumbnail"],
                        additionalProperties: false
                    }
                }
            },
            required: ["songs"],
            additionalProperties: false
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
    },
    {
        type: "function",
        name: "generate_speech",
        description: "Generates an voice audio from text using the OpenAI TTS model. Instructions for tone and style can be customized, and a voice can optionally be selected.",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "The text to be converted into audio."
                },
                instructions: {
                    type: "string",
                    description: "Instructions for the TTS model regarding intonation and style, such as emotion, tone, or accent."
                },
                voice: {
                    type: ["string", "null"],
                    enum: [
                        "alloy",
                        "ash",
                        "ballad",
                        "coral",
                        "echo",
                        "fable",
                        "onyx",
                        "nova",
                        "sage",
                        "shimmer",
                        "verse"
                    ],
                    description: "The name of the voice to use (e.g., 'coral', 'alloy', 'ash', 'onyx'). Optional."
                }
            },
            required: ["input", "instructions", "voice"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "create_image",
        description: `Generate NEW images from a text. Use it only when the user requests to create an image from scratch and does NOT provide any prior image as a reference.`,
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "Description of the image to generate." },
                outputFormat: { type: ["string"], enum: ["jpeg","webp","png"], description: "The format in which the generated images are returned", nullable: true },
                background: { type: ["string","null"], enum: ["opaque","transparent","auto"], description: "Transparent or opaque background. OPTIONAL", nullable: true },
            },
            required: ["prompt","outputFormat", "background"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "edit_image",
        description: `Edit, transform or create one or more existing reference images. Use this function only when you have one or more previously provided images (in base64 format) that you wish to modify, restyle, recolor, convert to a specific style (e.g., "Japanese style"), crop, or perform inpainting, etc.
This function always requires at least one reference image as input, and must not be used to create images from scratch without any reference. Changes can be subtle edits or major transformations, as long as they are based on the input image(s). IMPORTANT: do NOT use real group member names in the prompt—refer to the subjects as "the person in the first image," "the person in the second image," etc., so that the API no longer invents or recognizes names, but uses only the attached images as references.`,
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "Description of the changes to apply or image to generate    ." },
                imageIds: {
                    type: "array",
                    description: "Each element is the image_id of the image to use.",
                    items: { type: "string" }
                },
                outputFormat: { type: ["string"], enum: ["jpeg","webp","png"], description: "The format in which the generated images are returned", nullable: true },
                mask: { type: ["string","null"], description: "Base64 of the mask (PNG with alpha channel). OPTIONAL", nullable: true },
                background: { type: ["string","null"], enum: ["opaque","transparent","auto"], description: "Transparent or opaque background. OPTIONAL", nullable: true },
            },
            required: ["prompt","imageIds", "outputFormat", "mask","background"],
            additionalProperties: false
        },
        strict: true
    }
];

/**
 * Pure helpers for multimedia routing and error handling. Kept free of
 * `discord.js`/`roboto`/`config` imports so they can be unit tested without a
 * running bot.
 */

export type TtsProvider = 'OPENAI' | 'ELEVENLABS';

/**
 * Resolves the TTS backend for a guild. Only `ELEVENLABS` opts out of the
 * default OpenAI TTS; anything else (including unset) resolves to OpenAI.
 */
export function resolveTtsProvider(value: unknown): TtsProvider {
  return value === 'ELEVENLABS' ? 'ELEVENLABS' : 'OPENAI';
}

/**
 * Sends an image to Discord and converts a `channel.send` rejection into a
 * controlled string error instead of letting it escape the tool handler.
 */
export async function sendImageFile(
  send: () => Promise<unknown>,
  onError: (error: unknown) => void
): Promise<string> {
  try {
    await send();
    return 'Image sent successfully.';
  } catch (e) {
    onError(e);
    const message = e instanceof Error ? e.message : String(e);
    return `Error creating image: "${message}"`;
  }
}

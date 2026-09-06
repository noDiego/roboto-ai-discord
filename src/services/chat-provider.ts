/**
 * Pure, side-effect free helpers for selecting the chat provider.
 *
 * Kept in its own module (no `discord.js`, `roboto`, `config` or network
 * imports) so the provider factory can be unit tested without credentials or
 * a running Discord client.
 */

export type ChatProvider = 'OPENAI' | 'ANTHROPIC' | 'DEEPSEEK';

export const CHAT_PROVIDERS: readonly ChatProvider[] = ['OPENAI', 'ANTHROPIC', 'DEEPSEEK'];

/**
 * Exhaustively parses and validates the `AI_PROVIDER` value.
 *
 * An unrecognized value throws instead of silently falling back to OpenAI, so
 * a typo in configuration fails loudly at startup.
 */
export function parseChatProvider(value: string | undefined): ChatProvider {
  const provider = (value || 'OPENAI').trim().toUpperCase();
  switch (provider) {
    case 'OPENAI':
    case 'ANTHROPIC':
    case 'DEEPSEEK':
      return provider;
    default:
      throw new Error(
        `Invalid AI_PROVIDER "${provider}". Valid values are "OPENAI", "ANTHROPIC" and "DEEPSEEK".`
      );
  }
}

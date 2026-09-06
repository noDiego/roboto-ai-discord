/**
 * Single source of truth for the in-memory conversation key used by provider
 * caches, the `lastProcessed` checkpoint and `/reset`.
 *
 * A separator is required: snowflake ids are not fixed-width, so plain
 * concatenation (`guildId + channelId`) could collide for different pairs.
 */
export function getConversationKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

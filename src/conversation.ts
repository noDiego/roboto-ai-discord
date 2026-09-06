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

/**
 * Pure transactional checkpoint commit: only advances `lastProcessed` when a
 * final answer exists. A provider failure leaves the previous checkpoint (and
 * cache) untouched, so the next attempt re-includes the unprocessed message.
 */
export function commitCheckpointIfSuccessful(
  lastProcessed: Map<string, string>,
  key: string,
  candidate: string | null,
  hasAnswer: boolean
): void {
  if (hasAnswer && candidate != null) {
    lastProcessed.set(key, candidate);
  }
}

/**
 * Pure `/reset` state mutation. It always targets the active chat service
 * (never the dedicated OpenAI multimedia client) and pins the checkpoint to
 * the latest message id so old context does not reappear.
 */
export function resetConversationState(
  chatService: { deleteChatCache(id: string): void },
  lastProcessed: Map<string, string>,
  key: string,
  lastMessageId: string
): void {
  chatService.deleteChatCache(key);
  lastProcessed.set(key, lastMessageId);
}

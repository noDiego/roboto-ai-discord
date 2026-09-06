'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  getConversationKey,
  commitCheckpointIfSuccessful,
  resetConversationState
} = require('../build/conversation.js');

test('getConversationKey separates guild and channel', () => {
  assert.equal(getConversationKey('g', 'c'), 'g:c');
  assert.notEqual(getConversationKey('g1', 'c2'), getConversationKey('g12', 'c'));
});

// --- Case 15: provider failure does not advance lastProcessed ----------------

test('commitCheckpointIfSuccessful only advances on success', () => {
  const m = new Map();
  commitCheckpointIfSuccessful(m, 'k', 'candidate-1', false);
  assert.equal(m.has('k'), false, 'failure must not advance the checkpoint');

  commitCheckpointIfSuccessful(m, 'k', 'candidate-1', true);
  assert.equal(m.get('k'), 'candidate-1');

  commitCheckpointIfSuccessful(m, 'k', null, true);
  assert.equal(m.get('k'), 'candidate-1', 'a null candidate is ignored');
});

// --- Case 8: /reset targets the active chat service --------------------------

test('resetConversationState deletes the active chat cache and pins the checkpoint', () => {
  const deleted = [];
  const chatService = { deleteChatCache: (id) => deleted.push(id) };
  const lastProcessed = new Map();

  resetConversationState(chatService, lastProcessed, 'g:c', 'last-id');

  assert.deepEqual(deleted, ['g:c']);
  assert.equal(lastProcessed.get('g:c'), 'last-id');
});

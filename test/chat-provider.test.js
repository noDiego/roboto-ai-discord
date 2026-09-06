'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseChatProvider } = require('../build/services/chat-provider.js');

test('factory selects OpenAI, Anthropic and DeepSeek (case-insensitive)', () => {
  assert.equal(parseChatProvider('OPENAI'), 'OPENAI');
  assert.equal(parseChatProvider('openai'), 'OPENAI');
  assert.equal(parseChatProvider('ANTHROPIC'), 'ANTHROPIC');
  assert.equal(parseChatProvider('DeepSeek'), 'DEEPSEEK');
  assert.equal(parseChatProvider(undefined), 'OPENAI');
});

test('an invalid provider throws instead of falling back to OpenAI', () => {
  assert.throws(() => parseChatProvider('MISTRAL'), /Invalid AI_PROVIDER/);
  assert.throws(() => parseChatProvider('gpt'), /Invalid AI_PROVIDER/);
  assert.throws(() => parseChatProvider('   '), /Invalid AI_PROVIDER/);
});

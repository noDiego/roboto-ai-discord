'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveTtsProvider, sendImageFile } = require('../build/services/multimedia-helpers.js');
const { DeepSeekService } = require('../build/services/deepseek-service.js');

// --- Case 17: DeepSeek chat never owns multimedia capabilities ---------------

test('DeepSeekService implements only the chat contract (no multimedia methods)', () => {
  const multimediaMethods = ['createImage', 'editImage', 'speechStream', 'lyricSongGeneration', 'customMsg'];
  for (const m of multimediaMethods) {
    assert.equal(typeof DeepSeekService.prototype[m], 'undefined', `DeepSeek chat must not expose ${m}`);
  }
  assert.equal(typeof DeepSeekService.prototype.sendMessage, 'function');
  assert.equal(typeof DeepSeekService.prototype.hasChatCache, 'function');
  assert.equal(typeof DeepSeekService.prototype.deleteChatCache, 'function');
});

// --- Case 18: TTS provider routing -------------------------------------------

test('TTS provider resolves OpenAI by default and ElevenLabs explicitly', () => {
  assert.equal(resolveTtsProvider(undefined), 'OPENAI');
  assert.equal(resolveTtsProvider('OPENAI'), 'OPENAI');
  assert.equal(resolveTtsProvider('ELEVENLABS'), 'ELEVENLABS');
  assert.equal(resolveTtsProvider('something-else'), 'OPENAI');
});

// --- Case 19: channel.send rejection becomes a controlled error --------------

test('channel.send rejection is returned as a controlled error', async () => {
  const errors = [];
  const result = await sendImageFile(
    async () => {
      throw new Error('Discord down');
    },
    (e) => errors.push(e)
  );
  assert.equal(result, 'Error creating image: "Discord down"');
  assert.equal(errors.length, 1);
});

test('channel.send success returns the success message', async () => {
  const result = await sendImageFile(async () => {}, () => {});
  assert.equal(result, 'Image sent successfully.');
});

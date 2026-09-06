'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DeepSeekService,
  buildDeepSeekTools,
  trimDeepSeekTranscript,
  toStandardSchema,
  normalizeDeepSeekAnswer
} = require('../build/services/deepseek-service.js');
const { AITools } = require('../build/services/functions.js');

function makeInput() {
  return { guildId: 'guild-1', channelId: 'channel-1' };
}

function makeGuild(overrides = {}) {
  return {
    guildId: 'guild-1',
    guildConfig: { botName: 'Roboto', maxMessages: 30, ...overrides }
  };
}

function makeResponse({ output, output_text }) {
  return { output, output_text, usage: { input_tokens: 1, output_tokens: 1 } };
}

function makeFakeClient(handler) {
  const calls = [];
  return {
    calls,
    responses: {
      create: async (body) => {
        calls.push(body);
        return handler(body, calls.length);
      }
    }
  };
}

// --- Case 2: model / base URL / omitted params / JSON normalization ---------

test('sends the configured model and omits unsupported params', async () => {
  const fake = makeFakeClient(() =>
    makeResponse({ output: [], output_text: '{"message":"hi","author":"Roboto","type":"text"}' })
  );
  const service = new DeepSeekService({
    client: fake,
    maxCycles: 6,
    chatModel: 'deepseek-v4-flash-vision-exp',
    executeFunctions: async () => 'ok'
  });

  const result = await service.sendMessage(
    [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    'system',
    makeInput(),
    makeGuild(),
    []
  );

  assert.equal(fake.calls.length, 1);
  const body = fake.calls[0];
  assert.equal(body.model, 'deepseek-v4-flash-vision-exp');
  assert.equal(body.reasoning.effort, 'low');
  assert.equal(body.text.format.type, 'json_schema');
  assert.ok(!('store' in body), 'store must be omitted');
  assert.ok(!('prompt_cache_key' in body), 'prompt_cache_key must be omitted');
  assert.ok(!('previous_response_id' in body), 'previous_response_id must be omitted');
  assert.ok(!('verbosity' in body.text), 'text.verbosity must be omitted');
  assert.ok(!('summary' in body.reasoning), 'reasoning.summary must be omitted');

  assert.equal(result, JSON.stringify({ message: 'hi', author: 'Roboto', type: 'text' }));
});

test('uses the DeepSeek base URL', () => {
  const service = new DeepSeekService({
    apiKey: 'test-key',
    maxCycles: 6,
    chatModel: 'deepseek-v4-flash-vision-exp'
  });
  assert.equal(service.deepSeek.baseURL, 'https://api.deepseek.com');
});

test('normalizes an incomplete JSON output into a valid AIAnswer', () => {
  assert.deepEqual(JSON.parse(normalizeDeepSeekAnswer('{"message":"hola"}', 'Roboto')), {
    message: 'hola',
    author: 'Roboto',
    type: 'text'
  });
  assert.deepEqual(
    JSON.parse(normalizeDeepSeekAnswer('{"message":"hola","author":"X","type":"bogus"}', 'Roboto')),
    { message: 'hola', author: 'X', type: 'text' }
  );
  assert.deepEqual(JSON.parse(normalizeDeepSeekAnswer('just plain text', 'Roboto')), {
    message: 'just plain text',
    author: 'Roboto',
    type: 'text'
  });
});

// --- Case 3: tools copy ------------------------------------------------------

test('buildDeepSeekTools does not mutate AITools and never enables strict', () => {
  const before = JSON.parse(JSON.stringify(AITools));
  const copy = buildDeepSeekTools(AITools);

  assert.notEqual(copy, AITools);
  assert.deepEqual(AITools, before, 'AITools must not be mutated');

  for (const tool of copy) {
    if (tool.type === 'function') {
      assert.ok(!('strict' in tool), `function tool "${tool.name}" must not carry strict`);
    }
  }
  assert.ok(AITools.some((t) => t.type === 'function' && 'strict' in t));
});

test('toStandardSchema drops strict/nullable and widens nullable types', () => {
  assert.deepEqual(
    toStandardSchema({
      type: 'object',
      strict: true,
      nullable: true,
      properties: { x: { type: 'string', nullable: true } }
    }),
    {
      type: ['object', 'null'],
      properties: { x: { type: ['string', 'null'] } }
    }
  );
});

// --- Case 4: multiple function calls ----------------------------------------

test('multiple function_calls produce one output per call_id', async () => {
  const fake = makeFakeClient((_body, callIndex) => {
    if (callIndex === 1) {
      return makeResponse({
        output: [
          {
            type: 'function_call',
            name: 'web_search',
            arguments: JSON.stringify({ query: 'a', user_location: 'cl' }),
            call_id: 'call-1'
          },
          {
            type: 'function_call',
            name: 'search_youtube',
            arguments: JSON.stringify({ query: 'b' }),
            call_id: 'call-2'
          }
        ],
        output_text: ''
      });
    }
    return makeResponse({ output: [], output_text: '{"message":"done","author":"Roboto","type":"text"}' });
  });

  const executed = [];
  const service = new DeepSeekService({
    client: fake,
    maxCycles: 6,
    chatModel: 'm',
    executeFunctions: async (name, args) => {
      executed.push({ name, args });
      return 'ok';
    }
  });

  await service.sendMessage(
    [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    's',
    makeInput(),
    makeGuild(),
    []
  );

  assert.deepEqual(executed.map((e) => e.name).sort(), ['search_youtube', 'web_search']);

  const outputs = fake.calls[1].input.filter((i) => i.type === 'function_call_output');
  assert.equal(outputs.length, 2);
  assert.deepEqual(outputs.map((o) => o.call_id).sort(), ['call-1', 'call-2']);
});

// --- Case 5: invalid arguments never execute a handler ----------------------

test('invalid arguments never reach the handler', async () => {
  const cases = [
    { name: 'web_search', args: 'not json' },
    { name: 'web_search', args: JSON.stringify({ query: 'only query' }) },
    { name: 'search_youtube', args: JSON.stringify({}) },
    { name: 'search_youtube', args: JSON.stringify({ query: 'x', maxResults: 'not-int' }) },
    { name: 'search_youtube', args: JSON.stringify({ query: 'x', extra: true }) },
    { name: 'unknown_tool', args: JSON.stringify({}) }
  ];

  for (const c of cases) {
    const fake = makeFakeClient((_body, callIndex) => {
      if (callIndex === 1) {
        return makeResponse({
          output: [{ type: 'function_call', name: c.name, arguments: c.args, call_id: 'c1' }],
          output_text: ''
        });
      }
      return makeResponse({ output: [], output_text: '{"message":"done","author":"Roboto","type":"text"}' });
    });

    let executed = false;
    const service = new DeepSeekService({
      client: fake,
      maxCycles: 6,
      chatModel: 'm',
      executeFunctions: async () => {
        executed = true;
        return 'ok';
      }
    });

    await service.sendMessage(
      [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
      's',
      makeInput(),
      makeGuild(),
      []
    );

    assert.equal(executed, false, `handler ran for ${c.name} ${c.args}`);
    const output = fake.calls[1].input.find((i) => i.type === 'function_call_output');
    assert.ok(output, 'an error function_call_output must be produced');
    assert.match(output.output, /not valid JSON|do not match|not allowed|must be a JSON object/);
  }
});

// --- Case 6: failures do not commit the transcript --------------------------

test('HTTP 4xx/5xx/timeout failures do not commit the transcript', async () => {
  const failures = [
    Object.assign(new Error('bad request'), { status: 400 }),
    Object.assign(new Error('server error'), { status: 500 }),
    new Error('timeout')
  ];

  for (const err of failures) {
    const fake = makeFakeClient(async () => {
      throw err;
    });
    const service = new DeepSeekService({
      client: fake,
      maxCycles: 6,
      chatModel: 'm',
      executeFunctions: async () => 'ok'
    });

    await assert.rejects(() =>
      service.sendMessage(
        [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        's',
        makeInput(),
        makeGuild(),
        []
      )
    );
    assert.equal(service.hasChatCache('guild-1:channel-1'), false);
  }
});

test('cycle limit does not commit the transcript', async () => {
  const fake = makeFakeClient(() =>
    makeResponse({
      output: [
        {
          type: 'function_call',
          name: 'web_search',
          arguments: JSON.stringify({ query: 'q', user_location: 'cl' }),
          call_id: 'c'
        }
      ],
      output_text: ''
    })
  );
  const service = new DeepSeekService({
    client: fake,
    maxCycles: 2,
    chatModel: 'm',
    executeFunctions: async () => 'ok'
  });

  await assert.rejects(
    () =>
      service.sendMessage(
        [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        's',
        makeInput(),
        makeGuild(),
        []
      ),
    /limit of 2 communication cycles/
  );
  assert.equal(service.hasChatCache('guild-1:channel-1'), false);
});

// --- Case 7: trimming by complete turns --------------------------------------

test('trimDeepSeekTranscript keeps complete turns and call/output pairs', () => {
  const items = [
    { role: 'user', content: [{ type: 'input_text', text: 't1' }] },
    { type: 'message', content: [] },
    { type: 'function_call', name: 'x', call_id: 'c1' },
    { type: 'function_call_output', call_id: 'c1', output: '{}' },
    { role: 'user', content: [{ type: 'input_text', text: 't2' }] },
    { type: 'message', content: [] }
  ];

  const oneTurn = trimDeepSeekTranscript(items, 1);
  assert.equal(oneTurn.length, 2);
  assert.equal(oneTurn[0].role, 'user');
  assert.equal(oneTurn[1].type, 'message');
  assert.ok(!oneTurn.some((i) => i.type === 'function_call_output'));

  const twoTurns = trimDeepSeekTranscript(items, 2);
  assert.deepEqual(twoTurns, items);
});

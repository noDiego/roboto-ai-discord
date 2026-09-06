'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  convertAttachmentsToAiMessage,
  applyImageRequestBudget,
  encodeImageReference,
  decodeImageReference,
  isCompositeImageReference,
  selectAttachmentForReference,
  isSupportedImageMime,
  getMaxImageDimension,
  serializeMessageMetadata
} = require('../build/vision.js');

function downloader(map) {
  return async (url) => {
    if (map[url] && map[url].error) {
      const err = new Error(map[url].error.message || 'download failed');
      err.reason = map[url].error.reason;
      throw err;
    }
    return {
      dataUrl: map[url]?.dataUrl || 'data:image/png;base64,QQ==',
      contentType: map[url]?.contentType || 'image/png'
    };
  };
}

// --- Cases 9/10: text + images survive and are ordered -----------------------

test('text + two images produce two ordered image contents with distinct ids', async () => {
  const result = await convertAttachmentsToAiMessage(
    {
      messageId: 'msg-1',
      isBot: false,
      text: 'look',
      author: 'Alice',
      date: '2026-09-05 10:00:00',
      attachments: [
        { id: 'att-1', contentType: 'image/png', url: 'u1' },
        { id: 'att-2', contentType: 'image/jpeg', url: 'u2' }
      ]
    },
    downloader({
      u1: { dataUrl: 'data:image/png;base64,AAAA' },
      u2: { dataUrl: 'data:image/jpeg;base64,BBBB', contentType: 'image/jpeg' }
    })
  );

  assert.ok(result);
  const imageContents = result.content.filter((c) => c.type === 'image');
  assert.equal(imageContents.length, 2);
  assert.equal(imageContents[0].attachment_index, 0);
  assert.equal(imageContents[1].attachment_index, 1);
  assert.notEqual(imageContents[0].image_id, imageContents[1].image_id);
  assert.ok(isCompositeImageReference(imageContents[0].image_id));
  assert.ok(isCompositeImageReference(imageContents[1].image_id));

  assert.equal(result.metadata.author, 'Alice');
  assert.equal(result.metadata.date, '2026-09-05 10:00:00');
  assert.equal(result.metadata.message, 'look');
  assert.equal(result.metadata.images.length, 2);
  assert.equal(result.metadata.images[0].attachmentIndex, 0);
  assert.equal(result.metadata.images[1].attachmentIndex, 1);
});

test('image-only message keeps its attachment (no image is dropped)', async () => {
  const result = await convertAttachmentsToAiMessage(
    { messageId: 'm', isBot: false, text: '', author: 'A', date: 'd', attachments: [{ id: 'a1', contentType: 'image/png', url: 'u' }] },
    downloader({})
  );
  assert.ok(result);
  assert.equal(result.content.filter((c) => c.type === 'image').length, 1);
  assert.equal(result.metadata.message, '');
});

// --- Case 11: bot-published image keeps role user and real author ------------

test('bot-published image is emitted with role user and preserves the author', async () => {
  const result = await convertAttachmentsToAiMessage(
    { messageId: 'm', isBot: true, text: '', author: 'RobotoBot', date: 'd', attachments: [{ id: 'a1', contentType: 'image/png', url: 'u' }] },
    downloader({})
  );
  assert.equal(result.role, 'user');
  assert.equal(result.metadata.author, 'RobotoBot');
});

test('bot text-only message (no image) remains assistant', async () => {
  const result = await convertAttachmentsToAiMessage(
    { messageId: 'm', isBot: true, text: 'hi', author: 'RobotoBot', date: 'd', attachments: [] },
    downloader({})
  );
  assert.equal(result.role, 'assistant');
});

// --- Case 12: one failed attachment does not discard the rest ----------------

test('failed first attachment keeps text and the second valid attachment', async () => {
  const result = await convertAttachmentsToAiMessage(
    {
      messageId: 'm',
      isBot: false,
      text: 'hey',
      author: 'A',
      date: 'd',
      attachments: [
        { id: 'a1', contentType: 'image/png', url: 'bad' },
        { id: 'a2', contentType: 'image/jpeg', url: 'good' }
      ]
    },
    downloader({
      bad: { error: { message: 'nope', reason: 'download_failed' } },
      good: { dataUrl: 'data:image/jpeg;base64,QQ==', contentType: 'image/jpeg' }
    })
  );

  assert.ok(result);
  const images = result.content.filter((c) => c.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].attachment_index, 1);
  assert.equal(result.metadata.message, 'hey');
  assert.equal(result.metadata.images.length, 2);
  assert.equal(result.metadata.images[0].reason, 'download_failed');
  assert.equal(result.metadata.images[1].reason, undefined);
});

// --- Case 13: invalid MIME/size/dimension/timeout -> markers (no data URL) ---

test('invalid MIME, dimensions, size and timeout degrade to markers without data URL', async () => {
  const result = await convertAttachmentsToAiMessage(
    {
      messageId: 'm',
      isBot: false,
      text: 'x',
      author: 'A',
      date: 'd',
      attachments: [
        { id: 'svg', contentType: 'image/svg+xml', url: 'svg' },
        { id: 'big', contentType: 'image/png', url: 'big', width: 9000, height: 10 },
        { id: 'timeout', contentType: 'image/png', url: 'timeout' },
        { id: 'large', contentType: 'image/png', url: 'large' },
        { id: 'ok', contentType: 'image/png', url: 'ok' }
      ]
    },
    downloader({
      timeout: { error: { reason: 'timeout' } },
      large: { error: { reason: 'too_large' } },
      ok: { dataUrl: 'data:image/png;base64,QQ==' }
    })
  );

  assert.ok(result);
  const images = result.content.filter((c) => c.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].image_id, encodeImageReference('m', 'ok'));

  const reasons = result.metadata.images.map((i) => i.reason);
  assert.deepEqual(reasons, [
    'unsupported_type',
    'dimensions_exceeded',
    'timeout',
    'too_large',
    undefined
  ]);

  for (const c of result.content) {
    if (c.type === 'image') {
      assert.ok(c.value.startsWith('data:image/png;base64,'));
    }
  }
});


// --- Case 14: budget degrades historical images first and respects limits ----

test('image budget degrades historical images first and never exceeds limits', () => {
  const imgUrl = 'data:image/png;base64,' + 'A'.repeat(1024);
  const transcript = [
    { role: 'user', content: [{ type: 'input_text', text: 't0' }, { type: 'input_image', image_url: imgUrl }] },
    { role: 'user', content: [{ type: 'input_text', text: 't1' }, { type: 'input_image', image_url: imgUrl }] }
  ];

  const limited = applyImageRequestBudget(transcript, 1, {
    maxBodyBytes: 1_000_000,
    maxImageBytes: 10_000,
    maxTotalImageBytes: 1300,
    maxImageCount: 10
  });

  assert.ok(!limited[0].content.some((c) => c.type === 'input_image'));
  assert.ok(limited[0].content.some((c) => c.type === 'input_text' && c.text.includes('image_omitted')));
  assert.ok(limited[1].content.some((c) => c.type === 'input_image'));

  const totalImageBytes = limited
    .flatMap((i) => i.content)
    .filter((c) => c.type === 'input_image')
    .reduce((sum, c) => sum + Buffer.byteLength(c.image_url, 'utf8'), 0);
  assert.ok(totalImageBytes <= 1300);
});

// --- Case 16: composite reference encode/decode and selection -----------------

test('composite reference roundtrip and invalid reference handling', () => {
  const ref = encodeImageReference('msg-9', 'att-9');
  assert.ok(isCompositeImageReference(ref));
  assert.deepEqual(decodeImageReference(ref), { messageId: 'msg-9', attachmentId: 'att-9' });
  assert.equal(decodeImageReference('plain-id'), null);
  assert.equal(decodeImageReference('imgref:not-base64!'), null);
});

test('selectAttachmentForReference picks exact attachment and legacy first image', () => {
  const attachments = [
    { id: 'a1', contentType: 'image/png' },
    { id: 'a2', contentType: 'image/jpeg' }
  ];

  const ref2 = encodeImageReference('msg-1', 'a2');
  assert.equal(selectAttachmentForReference(ref2, 'msg-1', attachments), 'a2');
  assert.equal(selectAttachmentForReference(ref2, 'other-msg', attachments), null);
  assert.equal(selectAttachmentForReference('msg-1', 'msg-1', attachments), 'a1');
  assert.equal(
    selectAttachmentForReference('msg-1', 'msg-1', [
      { id: 'x', contentType: 'application/pdf' },
      ...attachments
    ]),
    'a1'
  );
});

// --- small helpers sanity ----------------------------------------------------

test('isSupportedImageMime only accepts JPEG/PNG/GIF/WebP', () => {
  assert.ok(isSupportedImageMime('image/png'));
  assert.ok(isSupportedImageMime('image/jpeg'));
  assert.ok(isSupportedImageMime('image/gif'));
  assert.ok(isSupportedImageMime('image/webp'));
  assert.ok(isSupportedImageMime('image/png; charset=utf-8'));
  assert.ok(!isSupportedImageMime('image/svg+xml'));
  assert.ok(!isSupportedImageMime('image/avif'));
  assert.ok(!isSupportedImageMime(undefined));
});

test('getMaxImageDimension applies the 15+ image rule', () => {
  assert.equal(getMaxImageDimension(14), 8192);
  assert.equal(getMaxImageDimension(15), 4096);
});

test('serializeMessageMetadata emits JSON metadata', () => {
  const md = { message: 'hi', author: 'A', date: 'd', images: [] };
  assert.equal(serializeMessageMetadata(md), JSON.stringify(md));
});


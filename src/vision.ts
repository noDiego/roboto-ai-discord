import { AIContent, AIRole, MessageImageMetadata, MessageMetadata } from './interfaces/ai-interfaces';

// DeepSeek vision only supports JPEG, PNG, GIF and WebP.
export const SUPPORTED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

export const MAX_IMAGE_BYTES = 32 * 1024 * 1024; // 32 MiB per inline image
export const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024; // 64 MiB total inline images
export const MAX_IMAGE_COUNT = 600;
export const MAX_BODY_BYTES = 48 * 1024 * 1024; // 48 MiB request body

export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_DIMENSION_MANY = 4096;
export const MANY_IMAGES_THRESHOLD = 15;

export type DegradeReason =
  | 'unsupported_type'
  | 'download_failed'
  | 'timeout'
  | 'too_large'
  | 'dimensions_exceeded'
  | 'request_budget'
  | 'provider_rejected_image';

export function isSupportedImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const normalized = mime.toLowerCase().split(';')[0].trim();
  return SUPPORTED_IMAGE_MIME_TYPES.includes(normalized);
}

export function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.toLowerCase().split(';')[0].trim().startsWith('image/');
}

export function getMaxImageDimension(imageCount: number): number {
  return imageCount >= MANY_IMAGES_THRESHOLD ? MAX_IMAGE_DIMENSION_MANY : MAX_IMAGE_DIMENSION;
}

// --- Composite image references -------------------------------------------

const IMAGE_REF_PREFIX = 'imgref:';

export interface ImageReference {
  messageId: string;
  attachmentId: string;
}

export function encodeImageReference(messageId: string, attachmentId: string): string {
  return IMAGE_REF_PREFIX + Buffer.from(JSON.stringify({ m: messageId, a: attachmentId })).toString('base64url');
}

export function decodeImageReference(reference: string): ImageReference | null {
  if (typeof reference !== 'string' || !reference.startsWith(IMAGE_REF_PREFIX)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(reference.slice(IMAGE_REF_PREFIX.length), 'base64url').toString('utf8'));
    if (parsed && typeof parsed.m === 'string' && typeof parsed.a === 'string') {
      return { messageId: parsed.m, attachmentId: parsed.a };
    }
    return null;
  } catch {
    return null;
  }
}

export function isCompositeImageReference(reference: string): boolean {
  return typeof reference === 'string' && reference.startsWith(IMAGE_REF_PREFIX);
}

// --- Attachment ingestion ----------------------------------------------------

export interface VisionAttachment {
  id: string;
  contentType?: string | null;
  url: string;
  size?: number;
  width?: number | null;
  height?: number | null;
}

export type ImageDownloader = (url: string, size?: number) => Promise<{ dataUrl: string; contentType: string }>;

export interface VisionConversionResult {
  role: AIRole;
  name?: string;
  content: AIContent[];
  metadata: MessageMetadata;
}

function isImageDimensionsExceeded(attachment: VisionAttachment, limit: number): boolean {
  const width = typeof attachment.width === 'number' ? attachment.width : null;
  const height = typeof attachment.height === 'number' ? attachment.height : null;
  if (width == null || height == null) return false;
  return width > limit || height > limit;
}

/**
 * Pure conversion of a Discord message into an `AiMessage` with vision
 * content. It is the shared pipeline for both the first turn and cached turns,
 * and the single source of truth for per-attachment degradation.
 *
 * `download` is injected so the function can be tested without network access:
 * it resolves to a data URL on success or rejects with `{ reason }` (a
 * `DegradeReason`) on failure. A single failing attachment only degrades that
 * image; text, metadata and other valid images are preserved.
 */
export async function convertAttachmentsToAiMessage(
  input: {
    messageId: string;
    isBot: boolean;
    text: string;
    author: string | null;
    date: string;
    attachments: VisionAttachment[];
  },
  download: ImageDownloader
): Promise<VisionConversionResult | null> {
  const { messageId, isBot, text, author, date, attachments } = input;

  const hasImageAttachment = attachments.some((a) => isImageMime(a.contentType));
  // A bot message that carries an image is still emitted as `user`, because
  // DeepSeek rejects `input_image` under `assistant`/`system`.
  const role: AIRole = !isBot || hasImageAttachment ? AIRole.USER : AIRole.ASSISTANT;

  const content: AIContent[] = [];
  const images: MessageImageMetadata[] = [];

  let attachmentIndex = 0;
  for (const attachment of attachments) {
    const index = attachmentIndex++;
    const mime = (attachment.contentType || '').toLowerCase();

    // Non-image attachments are ignored for vision (never sent).
    if (!isImageMime(mime)) continue;

    const imageId = encodeImageReference(messageId, attachment.id);

    if (isImageDimensionsExceeded(attachment, MAX_IMAGE_DIMENSION)) {
      images.push({
        imageId,
        attachmentIndex: index,
        reason: 'dimensions_exceeded',
        width: attachment.width ?? undefined,
        height: attachment.height ?? undefined
      });
      continue;
    }

    if (!isSupportedImageMime(mime)) {
      images.push({ imageId, attachmentIndex: index, reason: 'unsupported_type' });
      continue;
    }

    try {
      const { dataUrl, contentType } = await download(attachment.url, attachment.size);
      content.push({
        type: 'image',
        value: dataUrl,
        media_type: contentType,
        image_id: imageId,
        attachment_index: index,
        width: attachment.width ?? undefined,
        height: attachment.height ?? undefined,
        date
      });
      images.push({
        imageId,
        attachmentIndex: index,
        width: attachment.width ?? undefined,
        height: attachment.height ?? undefined
      });
    } catch (e) {
      const reason: DegradeReason = (e as any)?.reason ?? 'download_failed';
      images.push({ imageId, attachmentIndex: index, reason });
    }
  }

  if (text.length === 0 && content.length === 0 && images.length === 0) {
    return null;
  }

  const metadata: MessageMetadata = { message: text, author: author ?? 'User', date, images };

  return { role, name: author ?? undefined, content, metadata };
}

// --- Reference resolution ----------------------------------------------------

/**
 * Resolves an `edit_image` reference to a specific attachment id:
 *  - a composite reference (`imgref:`) must belong to `messageId` and selects
 *    the exact attachment;
 *  - a legacy plain message id selects the first eligible image.
 *
 * Returns `null` when the reference does not resolve.
 */
export function selectAttachmentForReference(
  reference: string,
  messageId: string,
  attachments: Array<{ id: string; contentType?: string | null }>
): string | null {
  if (typeof reference !== 'string') return null;

  const ref = decodeImageReference(reference);
  if (ref) {
    if (ref.messageId !== messageId) return null;
    const exact = attachments.find((a) => a.id === ref.attachmentId);
    return exact ? exact.id : null;
  }

  const first = attachments.find((a) => isSupportedImageMime(a.contentType));
  return first ? first.id : null;
}


// --- Metadata serialization ------------------------------------------------

export function serializeMessageMetadata(metadata: MessageMetadata): string {
  return JSON.stringify(metadata);
}

// --- Request budget ---------------------------------------------------------

export interface ImageBudgetLimits {
  maxBodyBytes?: number;
  maxImageBytes?: number;
  maxTotalImageBytes?: number;
  maxImageCount?: number;
}

interface ImageLocation {
  itemIndex: number;
  contentIndex: number;
  isCurrent: boolean;
  bytes: number;
  degraded?: boolean;
}

/**
 * Pure budget pass over a Responses-style transcript.
 *
 * It mutates a deep copy: any `input_image` content that cannot fit is replaced
 * by a structured text marker (no data URL). Degradation order is:
 *   1. historical images, oldest first;
 *   2. current-turn images, last first (so the first ones are kept in order).
 *
 * `currentTurnStartIndex` marks where the just-added turn begins.
 */
export function applyImageRequestBudget(
  transcript: any[],
  currentTurnStartIndex: number,
  limits: ImageBudgetLimits = {}
): any[] {
  const maxBody = limits.maxBodyBytes ?? MAX_BODY_BYTES;
  const maxImage = limits.maxImageBytes ?? MAX_IMAGE_BYTES;
  const maxTotal = limits.maxTotalImageBytes ?? MAX_TOTAL_IMAGE_BYTES;
  const maxCount = limits.maxImageCount ?? MAX_IMAGE_COUNT;

  const result: any[] = structuredClone(transcript);

  const images: ImageLocation[] = [];
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (!item || typeof item !== 'object' || !Array.isArray(item.content)) continue;
    for (let j = 0; j < item.content.length; j++) {
      const c = item.content[j];
      if (c && c.type === 'input_image' && typeof c.image_url === 'string') {
        images.push({
          itemIndex: i,
          contentIndex: j,
          isCurrent: i >= currentTurnStartIndex,
          bytes: Buffer.byteLength(c.image_url, 'utf8')
        });
      }
    }
  }

  const degrade = (loc: ImageLocation, reason: DegradeReason): void => {
    const item = result[loc.itemIndex];
    item.content[loc.contentIndex] = {
      type: 'input_text',
      text: JSON.stringify({ image_omitted: true, reason })
    };
    loc.degraded = true;
  };

  // 1. Individual per-image limit always degrades, regardless of priority.
  for (const img of images) {
    if (img.bytes > maxImage) degrade(img, 'too_large');
  }

  const degradationOrder = (list: ImageLocation[]): ImageLocation[] =>
    [...list].sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
      if (!a.isCurrent) return a.itemIndex - b.itemIndex;
      return b.itemIndex - a.itemIndex;
    });

  // 2. Total image count limit.
  let active = images.filter((img) => !img.degraded);
  if (active.length > maxCount) {
    for (const img of degradationOrder(active).slice(0, active.length - maxCount)) {
      degrade(img, 'request_budget');
    }
  }

  // 3. Body and total-image byte budgets.
  while (true) {
    active = images.filter((img) => !img.degraded);
    const totalImageBytes = active.reduce((sum, img) => sum + img.bytes, 0);
    const bodyBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (bodyBytes <= maxBody && totalImageBytes <= maxTotal) break;
    const next = degradationOrder(active)[0];
    if (!next) break;
    degrade(next, 'request_budget');
  }

  return result;
}

import { MessageMetadata } from './interfaces/ai-interfaces';

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

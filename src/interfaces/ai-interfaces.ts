export interface AiMessage {
  role: AIRole;
  content: Array<AIContent>;
  name?: string;
  metadata?: MessageMetadata;
}

export enum AIRole {
  USER='user',
  ASSISTANT='assistant',
  SYSTEM='system'
}

export interface AIContent {
  value?: string;
  type: 'text' | 'image';
  media_type?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/url' |string;
  image_id?: string;
  attachment_index?: number;
  width?: number;
  height?: number;
  date: string;
}

/**
 * Ordered per-image metadata. `imageId` is the reversible composite reference
 * (messageId + attachmentId). `reason` is only present when the image was
 * degraded and therefore is not sent to the provider.
 */
export interface MessageImageMetadata {
  imageId: string;
  attachmentIndex: number;
  reason?: string;
  width?: number;
  height?: number;
}

/**
 * Textual metadata block emitted once per message. It exists whether the
 * message has text or not, and carries author/date plus the ordered image list.
 */
export interface MessageMetadata {
  message: string;
  author: string;
  date: string;
  images: MessageImageMetadata[];
}


export enum AIProvider {
  OPENAI='OPENAI',
  DEEPINFRA='DEEPINFRA'
}

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  chatModel: string;
  speechModel?: string;
  imageModel?: string;
}

export interface AIAnswer {
  message: string;
  type: 'text' | 'voice';
  author: string;
}

export interface OperationResult {
  success: boolean;
  result: any;
}
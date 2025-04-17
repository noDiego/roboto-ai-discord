export interface AiMessage {
  role: AIRole;
  content: Array<AIContent>;
  name?: string;
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

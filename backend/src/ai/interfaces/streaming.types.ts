// Types des événements SSE envoyés au client

export type SseEventType = 'token' | 'tool_call' | 'done' | 'error';

export interface SseTokenEvent {
  type: 'token';
  content: string;
}

export interface SseToolCallEvent {
  type: 'tool_call';
  name: string;
  label?: string;
}

export interface SseDoneEvent {
  type: 'done';
  toolsUsed: string[];
}

export interface SseErrorEvent {
  type: 'error';
  message: string;
}

export type SseEvent =
  | SseTokenEvent
  | SseToolCallEvent
  | SseDoneEvent
  | SseErrorEvent;

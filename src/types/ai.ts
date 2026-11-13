export interface AiConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  anonymizeData: boolean;
  // Module B: Offline Local LLM (Ollama) Failover
  ollamaEnabled?: boolean;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultModel: string;
  description: string;
}

export type AiAnalysisStatus = 'idle' | 'generating' | 'completed' | 'error';

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  activeModelUsed?: string;
  isOfflineFailover?: boolean;
  failoverReason?: string;
}

export interface AiAnalysisState {
  status: AiAnalysisStatus;
  content: string;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  activeModelUsed?: string;
  isOfflineFailover?: boolean;
  failoverReason?: string;
}

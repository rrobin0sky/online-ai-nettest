import { AiConfig, ProviderPreset } from '../types/ai';

const AI_CONFIG_STORAGE_KEY = 'netpath_lens_ai_config_v1';

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiBaseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.2,
  anonymizeData: true,
  ollamaEnabled: true,
  ollamaBaseUrl: 'http://127.0.0.1:11434/v1',
  ollamaModel: 'qwen2.5:latest',
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    description: 'DeepSeek V3 高性价比深度推理模型',
  },
  {
    name: 'SiliconFlow (硅基流动)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    description: '国内高并发云端模型分发',
  },
  {
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    description: 'OpenAI 官方标准接口',
  },
  {
    name: 'Ollama 本地大模型',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3:latest',
    description: '完全本地隐私离线推理 (无须 API Key)',
  },
  {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    description: 'Moonshot 开放平台',
  },
];

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      apiBaseUrl: parsed.apiBaseUrl || DEFAULT_AI_CONFIG.apiBaseUrl,
      apiKey: parsed.apiKey || '',
      model: parsed.model || DEFAULT_AI_CONFIG.model,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_AI_CONFIG.temperature,
      anonymizeData: typeof parsed.anonymizeData === 'boolean' ? parsed.anonymizeData : DEFAULT_AI_CONFIG.anonymizeData,
      ollamaEnabled: typeof parsed.ollamaEnabled === 'boolean' ? parsed.ollamaEnabled : DEFAULT_AI_CONFIG.ollamaEnabled,
      ollamaBaseUrl: parsed.ollamaBaseUrl || DEFAULT_AI_CONFIG.ollamaBaseUrl,
      ollamaModel: parsed.ollamaModel || DEFAULT_AI_CONFIG.ollamaModel,
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function saveAiConfig(config: AiConfig): void {
  try {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save AI config to localStorage:', err);
  }
}

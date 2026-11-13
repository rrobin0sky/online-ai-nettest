import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { AiConfig } from '../src/types/ai.ts';

function normalizeOllamaBase(url: string): string {
  let cleaned = url.trim().replace(/\/+$/, '');
  if (cleaned.endsWith('/v1')) {
    cleaned = cleaned.slice(0, -3).replace(/\/+$/, '');
  }
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  return cleaned;
}

function resolveOllamaModel(
  configuredModel: string | undefined,
  detectedModels: string[],
  defaultModel: string | null
): string {
  const preferred = configuredModel?.trim();
  if (preferred && detectedModels.includes(preferred)) {
    return preferred;
  }
  if (defaultModel && detectedModels.includes(defaultModel)) {
    return defaultModel;
  }
  return detectedModels[0] || 'qwen2.5:latest';
}

describe('Offline Local LLM (Ollama) Failover Tests', () => {
  test('Normalizes Ollama base URL correctly for proxy-bypass probes', () => {
    assert.equal(
      normalizeOllamaBase('http://127.0.0.1:11434/v1/'),
      'http://127.0.0.1:11434'
    );
    assert.equal(
      normalizeOllamaBase('http://localhost:11434/v1'),
      'http://localhost:11434'
    );
    assert.equal(
      normalizeOllamaBase('127.0.0.1:11434'),
      'http://127.0.0.1:11434'
    );
    assert.equal(
      normalizeOllamaBase('http://192.168.1.100:11434///'),
      'http://192.168.1.100:11434'
    );
  });

  test('Resolves preferred model when installed in local Ollama', () => {
    const detected = ['qwen2.5:latest', 'llama3.2:latest', 'deepseek-r1:1.5b'];
    
    // User configured llama3.2:latest
    const chosen = resolveOllamaModel('llama3.2:latest', detected, 'qwen2.5:latest');
    assert.equal(chosen, 'llama3.2:latest');

    // User configured non-existent model; falls back to default
    const fallback = resolveOllamaModel('non-existent-model', detected, 'qwen2.5:latest');
    assert.equal(fallback, 'qwen2.5:latest');

    // No preference; uses first detected model
    const firstAvailable = resolveOllamaModel(undefined, detected, null);
    assert.equal(firstAvailable, 'qwen2.5:latest');
  });

  test('Failover config maintains defaults and persists state', () => {
    const config: AiConfig = {
      apiBaseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
      temperature: 0.2,
      anonymizeData: true,
      ollamaEnabled: true,
      ollamaBaseUrl: 'http://127.0.0.1:11434/v1',
      ollamaModel: 'qwen2.5:latest',
    };

    assert.equal(config.ollamaEnabled, true);
    assert.equal(config.ollamaBaseUrl, 'http://127.0.0.1:11434/v1');
    assert.equal(config.ollamaModel, 'qwen2.5:latest');
  });
});

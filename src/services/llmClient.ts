import { AiConfig, ChatMessage } from '../types/ai';
import { probeOllama } from './tauri-bridge';
import i18n from '../i18n';

export const AI_SYSTEM_PROMPT = `You are an expert Network Operations Center (NOC) Tier-3 Engineer and macOS Systems Specialist.
You are troubleshooting a live enterprise network issue based on the provided diagnostic snapshot.

Behavior Rules:
1. Base all answers strictly on the attached telemetry snapshot unless the user asks general theoretical questions.
2. Cross-Validate Control vs. Data Plane: Always compare L3 MTR ICMP metrics against L4/L7 TCP/TLS handshake metrics. If TCP/TLS handshake is fast and lossless (e.g., DNS < 120ms, TCP < 250ms, TTFB < 600ms), explicitly state that any intermediate MTR packet loss is caused by router Control Plane Policing (CoPP) or firewall ICMP filtering, NOT an actual traffic-affecting outage. Never declare a critical outage purely based on ICMP loss if the data plane is healthy.
3. If the user asks for router/switch configurations, output exact, production-ready syntax (e.g., Cisco IOS-XE, Huawei VRP, FortiOS, or Linux tc/fq_codel) with explanations.
4. When diagnosing, pinpoint exact hop numbers, IP addresses, ASNs, and interface metrics.
5. Keep answers concise, technical, and actionable. Do not repeat the entire telemetry analysis unless specifically requested.
6. When a BASELINE_DIFF_SUMMARY is attached in the telemetry, explicitly compare current metrics against the Golden Baseline, identify whether performance regressed, pinpoint which specific hops or ASNs caused the regression, and explain any ASN route shift / detour.
7. Format output in clean, high-density Markdown with severity callouts and syntax-highlighted code blocks.`;

/**
 * Build ground system prompt with compact telemetry YAML
 */
export function buildGroundingSystemPrompt(telemetryYaml: string, isZh: boolean): string {
  const langRule = isZh
    ? `\n\nLanguage Requirement: Reply in Simplified Chinese (zh-CN) following enterprise networking terminology (keep metric acronyms like SNR, RSSI, RTT, Jitter, MTR, Bufferbloat, MCS, TTFB alongside Chinese explanations).`
    : `\n\nLanguage Requirement: Reply in professional English using standard network engineering terms.`;

  return `${AI_SYSTEM_PROMPT}${langRule}\n\nAttached Diagnostic Telemetry Snapshot:\n\`\`\`yaml\n${telemetryYaml}\n\`\`\``;
}

/**
 * Clean and normalize API Base URL
 */
function normalizeBaseUrl(url: string): string {
  let cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}

/**
 * Test AI endpoint connection with a minimal prompt
 */
export async function testAiConnection(
  config: AiConfig
): Promise<{ success: boolean; message: string }> {
  const isZh = i18n.language ? i18n.language.startsWith('zh') : true;
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const endpoint = `${baseUrl}/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    if (response.ok) {
      return {
        success: true,
        message: isZh
          ? `连接成功！模型 [${config.model}] 响应正常。`
          : `Connection successful! Model [${config.model}] is responsive.`,
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        message: isZh
          ? '身份鉴权失败 (401 Unauthorized)：API Key 无效或未授权。'
          : 'Authentication failed (401 Unauthorized): Invalid or unauthorized API Key.',
      };
    }
    if (response.status === 404) {
      return {
        success: false,
        message: isZh
          ? `未找到指定模型或路径 (404 Not Found)：请确认模型名 [${config.model}] 及 Base URL 是否正确。`
          : `Model or endpoint not found (404 Not Found): Check model [${config.model}] and Base URL.`,
      };
    }
    if (response.status === 429) {
      return {
        success: false,
        message: isZh
          ? '触发速率限制或账户额度耗尽 (429 Rate Limit / Quota Exceeded)。'
          : 'Rate limit or quota exceeded (429 Rate Limit / Quota Exceeded).',
      };
    }

    const errText = await response.text().catch(() => '');
    return {
      success: false,
      message: isZh
        ? `接口返回异常状态码 HTTP ${response.status}: ${errText.slice(0, 150)}`
        : `API returned error HTTP ${response.status}: ${errText.slice(0, 150)}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: isZh
        ? `网络连接失败：${err?.message || '无法访问该端点，请检查网络或代理'}`
        : `Network connection error: ${err?.message || 'Cannot reach endpoint, check network or proxy'}`,
    };
  }
}

export interface StreamChatOptions {
  config: AiConfig;
  telemetryPayload: string;
  onToken: (token: string, fullText: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
  onFailover?: (info: { model: string; reason: string }) => void;
  signal?: AbortSignal;
}

export interface StreamMultiTurnChatOptions {
  config: AiConfig;
  systemPromptWithTelemetry: string;
  messages: ChatMessage[];
  onToken: (token: string, fullText: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
  onFailover?: (info: { model: string; reason: string }) => void;
  signal?: AbortSignal;
}

/**
 * Helper to parse SSE chunks from an OpenAI-compatible /v1/chat/completions stream
 */
async function streamSseResponse(
  response: Response,
  onToken: (token: string, fullText: string) => void,
  onComplete: (fullText: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('服务器未返回可读取的响应数据流。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulatedText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep partial line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          onComplete(accumulatedText);
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulatedText += delta;
            onToken(delta, accumulatedText);
          }
        } catch {
          // Partial JSON chunk
        }
      }
    }
  }

  onComplete(accumulatedText);
}

/**
 * Stream multi-turn chat completion with sliding context window (pinned system prompt + last 8 turns)
 * Includes Module B auto-failover to local Ollama during WAN outage or cloud timeout.
 */
export async function streamAiMultiTurnChat(options: StreamMultiTurnChatOptions): Promise<void> {
  const {
    config,
    systemPromptWithTelemetry,
    messages,
    onToken,
    onComplete,
    onError,
    onFailover,
    signal,
  } = options;
  const isZh = i18n.language ? i18n.language.startsWith('zh') : true;

  // Sliding window: keep up to the last 8 turns (excluding any system messages)
  const recentMessages = messages
    .filter((m) => m.role !== 'system')
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const apiMessages = [
    { role: 'system', content: systemPromptWithTelemetry },
    ...recentMessages,
  ];

  const primaryBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const primaryEndpoint = `${primaryBaseUrl}/chat/completions`;

  // Step 1: Attempt primary cloud LLM with 5000ms connection timeout
  let primaryFailed = false;
  let primaryErrorMsg = '';

  try {
    const timeoutCtrl = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => timeoutCtrl.abort());
    }
    const timer = setTimeout(() => timeoutCtrl.abort(), 5000);

    const response = await fetch(primaryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: apiMessages,
        temperature: config.temperature,
        stream: true,
      }),
      signal: timeoutCtrl.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          isZh
            ? 'API Key 无效 (401 Unauthorized)。请在设置中检查您的 API Key。'
            : 'Invalid API Key (401 Unauthorized). Please check your key in settings.'
        );
      }
      if (response.status === 404) {
        throw new Error(
          isZh
            ? `模型 [${config.model}] 未找到 (404 Not Found)。请检查模型名称与 API 端点。`
            : `Model [${config.model}] not found (404 Not Found). Check model name and endpoint.`
        );
      }
      if (response.status === 429) {
        throw new Error(
          isZh
            ? '接口限流或账户额度不足 (429 Too Many Requests)。请稍后重试或检查账户余额。'
            : 'Rate limit or quota exceeded (429 Too Many Requests). Please retry later.'
        );
      }
      const errBody = await response.text().catch(() => '');
      throw new Error(`API error (HTTP ${response.status}): ${errBody.slice(0, 200)}`);
    }

    await streamSseResponse(response, onToken, onComplete);
    return;
  } catch (err: any) {
    if (signal?.aborted) {
      onComplete('');
      return;
    }
    primaryFailed = true;
    primaryErrorMsg = err?.message || 'Cloud endpoint error';
  }

  // Step 2: Primary failed. Check if local Ollama failover is enabled
  if (primaryFailed && config.ollamaEnabled !== false) {
    try {
      const ollamaStatus = await probeOllama(config.ollamaBaseUrl);

      if (ollamaStatus.is_online && ollamaStatus.models.length > 0) {
        // Find best model: user specified or default or first available
        const preferred = config.ollamaModel?.trim();
        const chosenModel =
          preferred && ollamaStatus.models.includes(preferred)
            ? preferred
            : ollamaStatus.default_model || ollamaStatus.models[0];

        const failoverReason = isZh
          ? `云端端点超时/不可达 (${primaryErrorMsg.slice(0, 60)})，已自动无缝切换至本机离线大模型进行诊断。`
          : `Cloud endpoint timed out/unreachable, automatically switched to local offline LLM.`;

        onFailover?.({ model: chosenModel, reason: failoverReason });

        const ollamaEndpoint = `${ollamaStatus.base_url}/chat/completions`;

        const ollamaResponse = await fetch(ollamaEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: chosenModel,
            messages: apiMessages,
            temperature: config.temperature,
            stream: true,
          }),
          signal,
        });

        if (ollamaResponse.ok) {
          await streamSseResponse(ollamaResponse, onToken, onComplete);
          return;
        }
      }
    } catch {
      // Ollama probe failed
    }
  }

  // Step 3: Neither Cloud nor Ollama could serve the request.
  // Generate deterministic guidance instead of a raw crash.
  const offlineNotice = isZh
    ? `> [!WARNING]\n> **云端大模型连接失败且本机离线大模型 (Ollama) 未就绪**\n>\n> - **失败原因**: ${primaryErrorMsg}\n> - **离线应急处置指南**:\n>   1. 请在 macOS 终端启动 Ollama：\`ollama serve\`\n>   2. 运行本地轻量推理模型：\`ollama run qwen2.5\` 或 \`ollama run llama3.2\`\n>   3. 重新点击「开始 AI 根因诊断」，系统将自动直连本地进行断网离线推理。\n`
    : `> [!WARNING]\n> **Cloud LLM Failed & Local Ollama Not Available**\n>\n> - **Reason**: ${primaryErrorMsg}\n> - **Offline Remediation**:\n>   1. Launch Ollama in terminal: \`ollama serve\`\n>   2. Run local model: \`ollama run qwen2.5\` or \`ollama run llama3.2\`\n>   3. Retry diagnosis to perform local offline inference.\n`;

  onError(offlineNotice);
}

/**
 * Backward-compatible single-shot RCA analysis streaming wrapper
 */
export async function streamAiRcaAnalysis(options: StreamChatOptions): Promise<void> {
  const { config, telemetryPayload, onToken, onComplete, onError, onFailover, signal } = options;
  const isZh = i18n.language ? i18n.language.startsWith('zh') : true;
  const systemPrompt = buildGroundingSystemPrompt(telemetryPayload, isZh);

  const initialUserMessage: ChatMessage = {
    id: 'init_rca_prompt',
    role: 'user',
    content: isZh
      ? '请基于当前全栈网络遥测数据，提供严格确定性的根因分析（RCA）报告与分步排障处置方案。'
      : 'Please provide a deterministic Root Cause Analysis (RCA) report and step-by-step remediation plan based on the current telemetry data.',
    timestamp: Date.now(),
  };

  await streamAiMultiTurnChat({
    config,
    systemPromptWithTelemetry: systemPrompt,
    messages: [initialUserMessage],
    onToken,
    onComplete,
    onError,
    onFailover,
    signal,
  });
}

/**
 * Helper to extract ISP / NOC Trouble Ticket Draft from the generated markdown
 */
export function extractTicketDraft(markdown: string): string | null {
  const ticketRegex = /(?:###?\s*(?:ISP|NOC|工单|Trouble Ticket|Ticket Template)[\s\S]*?)(```[\s\S]*?```|(?:>[\s\S]*?(?=\n\n\S|\n#|$))|(?:\*\*[\s\S]*?(?=\n#|$)))/i;
  const match = markdown.match(ticketRegex);
  if (match) {
    return match[0].trim();
  }
  return null;
}


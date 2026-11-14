import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Sparkles,
  Copy,
  Check,
  StopCircle,
  RotateCcw,
  Settings,
  AlertTriangle,
  Code2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Send,
  User,
  Bot,
  MessageSquare,
  RefreshCw,
  Zap,
} from 'lucide-react';
import Markdown from 'markdown-to-jsx';
import { CompleteDiagnosticReport } from '../types';
import { AiConfig, AiAnalysisStatus, ChatMessage } from '../types/ai';
import { formatTelemetryForAI } from '../services/telemetrySanitizer';
import { isUsingOfficialGateway } from '../services/aiConfig';
import type { BaselineDiffResult } from '../services/baselineDiff';
import {
  streamAiMultiTurnChat,
  buildGroundingSystemPrompt,
  extractTicketDraft,
} from '../services/llmClient';

interface AiAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: CompleteDiagnosticReport | null;
  config: AiConfig;
  onOpenSettings: () => void;
  baselineDiff?: BaselineDiffResult | null;
}

export const AiAnalysisDrawer: React.FC<AiAnalysisDrawerProps> = ({
  isOpen,
  onClose,
  report,
  config,
  onOpenSettings,
  baselineDiff,
}) => {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language ? i18n.language.startsWith('zh') : true;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [status, setStatus] = useState<AiAnalysisStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState<boolean>(false);
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Grounding context tracking
  const [groundedReportId, setGroundedReportId] = useState<string | null>(null);
  const [switchedNotice, setSwitchedNotice] = useState<boolean>(false);
  const [failoverInfo, setFailoverInfo] = useState<{ model: string; reason: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll when messages change or while generating
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Handle report change or initial opening
  useEffect(() => {
    if (!isOpen || !report) return;

    const currentId = report.summary.id || report.summary.timestamp;

    if (!groundedReportId) {
      // First open
      setGroundedReportId(currentId);
      if (messages.length === 0) {
        startInitialTurn(report);
      }
    } else if (groundedReportId !== currentId) {
      // User switched report (e.g. inspected a history snapshot or ran a new scan)
      if (messages.length > 0) {
        setSwitchedNotice(true);
      } else {
        setGroundedReportId(currentId);
        startInitialTurn(report);
      }
    }
  }, [isOpen, report]);

  const startInitialTurn = async (activeReport: CompleteDiagnosticReport) => {
    const initialPromptText = isZh
      ? '请基于当前全栈网络遥测数据，提供严格确定性的根因分析（RCA）报告与分步排障处置方案。'
      : 'Please provide a deterministic Root Cause Analysis (RCA) report and step-by-step remediation plan based on the current telemetry data.';

    await executeChatTurn(initialPromptText, [], activeReport);
  };

  const executeChatTurn = async (
    userText: string,
    existingMessages: ChatMessage[],
    activeReport: CompleteDiagnosticReport
  ) => {
    setErrorMsg(null);
    setStatus('generating');

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    };

    const asstId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const assistantMsgPlaceholder: ChatMessage = {
      id: asstId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const nextMessages = [...existingMessages, userMsg, assistantMsgPlaceholder];
    setMessages(nextMessages);

    // Create abort controller
    abortControllerRef.current?.abort();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const payload = formatTelemetryForAI(activeReport, config.anonymizeData, baselineDiff);
    const systemPrompt = buildGroundingSystemPrompt(payload, isZh);

    await streamAiMultiTurnChat({
      config,
      systemPromptWithTelemetry: systemPrompt,
      messages: [...existingMessages, userMsg],
      onToken: (_token, fullText) => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === asstId ? { ...msg, content: fullText } : msg))
        );
      },
      onComplete: (fullText) => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === asstId ? { ...msg, content: fullText } : msg))
        );
        setStatus('completed');
      },
      onFailover: (info) => {
        setFailoverInfo(info);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === asstId
              ? {
                  ...msg,
                  activeModelUsed: info.model,
                  isOfflineFailover: true,
                  failoverReason: info.reason,
                }
              : msg
          )
        );
      },
      onError: (err) => {
        setErrorMsg(err);
        setStatus('error');
      },
      signal: abortCtrl.signal,
    });
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || status === 'generating' || !report) return;
    setInputValue('');
    executeChatTurn(text, messages, report);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setStatus('completed');
  };

  const handleResetChat = () => {
    if (!report) return;
    abortControllerRef.current?.abort();
    setMessages([]);
    setSwitchedNotice(false);
    setGroundedReportId(report.summary.id || report.summary.timestamp);
    startInitialTurn(report);
  };

  const handleKeepChat = () => {
    if (!report) return;
    setSwitchedNotice(false);
    setGroundedReportId(report.summary.id || report.summary.timestamp);
  };

  const handleCopyMessage = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleCopyTicket = (msgId: string, content: string) => {
    const draft = extractTicketDraft(content) || content;
    navigator.clipboard.writeText(draft);
    setCopiedTicketId(msgId);
    setTimeout(() => setCopiedTicketId(null), 2000);
  };

  if (!isOpen) return null;

  const sanitizedPayload = report ? formatTelemetryForAI(report, config.anonymizeData, baselineDiff) : '';

  const quickChips = [
    {
      id: 'chip1',
      text: t('aiChat.chip1'),
    },
    {
      id: 'chip2',
      text: t('aiChat.chip2'),
    },
    {
      id: 'chip3',
      text: t('aiChat.chip3'),
    },
    {
      id: 'chip4',
      text: t('aiChat.chip4'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#090d16] border-l border-white/[0.12] w-full max-w-3xl h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0d1220] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {t('aiChat.title')}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                  {isUsingOfficialGateway(config)
                    ? isZh
                      ? `${config.model || 'deepseek-v4-flash'} · 官方免配`
                      : `${config.model || 'deepseek-v4-flash'} · Built-in Free`
                    : config.model}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('aiChat.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetChat}
              disabled={status === 'generating'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
              title={t('aiChat.clearChat')}
            >
              <RotateCcw className="w-4 h-4 text-cyan-400" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title={t('nav.settings')}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Telemetry Switch Alert Banner */}
        {switchedNotice && report && (
          <div className="px-6 py-2.5 bg-amber-950/50 border-b border-amber-500/40 text-amber-200 text-xs font-mono flex items-center justify-between gap-3 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {t('aiChat.contextSwitched', { time: report.summary.timestamp || '最新快照' })}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetChat}
                className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition-colors cursor-pointer"
              >
                {t('aiChat.resetChat')}
              </button>
              <button
                onClick={handleKeepChat}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors cursor-pointer"
              >
                {t('aiChat.keepChat')}
              </button>
            </div>
          </div>
        )}

        {/* Offline Local LLM (Ollama) Failover Banner */}
        {failoverInfo && (
          <div className="px-6 py-2.5 bg-gradient-to-r from-amber-950/70 to-cyan-950/70 border-b border-amber-500/40 text-amber-200 text-xs font-mono flex items-center justify-between gap-3 shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
              <span>
                {t('ollama.failoverBannerTitle', { model: failoverInfo.model })}
              </span>
            </div>
            <div className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-300 font-bold shrink-0">
              OFFLINE LOCAL LLM
            </div>
          </div>
        )}

        {/* Collapsible Telemetry Payload Inspector */}
        <div className="border-b border-white/[0.06] bg-[#070a12] text-xs font-mono shrink-0">
          <button
            onClick={() => setShowPayload(!showPayload)}
            className="w-full px-6 py-2 flex items-center justify-between text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 text-[11px]">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              {t('aiDrawer.viewPayload')}
            </span>
            {showPayload ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showPayload && (
            <div className="px-6 py-3 bg-[#05070d] border-t border-white/[0.04] max-h-40 overflow-y-auto">
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed select-text font-mono">
                {sanitizedPayload}
              </pre>
            </div>
          )}
        </div>

        {/* Multi-Turn Message Feed */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-[#07090e] select-text space-y-6 font-sans"
        >
          {messages.length === 0 && !errorMsg && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 font-mono space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-white/[0.08] flex items-center justify-center text-cyan-400 animate-pulse">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white text-sm font-semibold">{t('aiDrawer.waitingTelemetry')}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {t('aiDrawer.promptHint')}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const ticketDraft = !isUser && msg.content ? extractTicketDraft(msg.content) : null;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-4 ${
                    isUser
                      ? 'bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 border border-cyan-500/40 text-cyan-50'
                      : 'bg-[#0e1322] border border-white/[0.08] text-slate-200'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap font-sans text-xs">{msg.content}</p>
                  ) : (
                    <article className="prose prose-invert prose-sm max-w-none text-slate-200 leading-relaxed font-sans space-y-3">
                      {msg.content ? (
                        <Markdown
                          options={{
                            overrides: {
                              h1: {
                                component: ({ children }) => (
                                  <h1 className="text-base font-bold text-white border-b border-white/[0.08] pb-1.5 mt-3 mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-cyan-400 inline" />
                                    {children}
                                  </h1>
                                ),
                              },
                              h2: {
                                component: ({ children }) => (
                                  <h2 className="text-sm font-bold text-cyan-300 border-b border-white/[0.06] pb-1 mt-4 mb-2">
                                    {children}
                                  </h2>
                                ),
                              },
                              h3: {
                                component: ({ children }) => (
                                  <h3 className="text-xs font-semibold text-indigo-300 mt-3 mb-1">
                                    {children}
                                  </h3>
                                ),
                              },
                              blockquote: {
                                component: ({ children }) => (
                                  <blockquote className="border-l-4 border-cyan-500/80 bg-cyan-950/20 px-3 py-1.5 rounded-r-lg my-2 text-cyan-100 font-mono text-[11px]">
                                    {children}
                                  </blockquote>
                                ),
                              },
                              code: {
                                component: ({ children, className }) => {
                                  const isBlock = className && className.includes('lang-');
                                  if (isBlock) {
                                    return (
                                      <pre className="p-3 rounded-xl bg-[#070a12] border border-white/[0.08] text-[11px] font-mono text-emerald-300 overflow-x-auto my-2.5">
                                        <code>{children}</code>
                                      </pre>
                                    );
                                  }
                                  return (
                                    <code className="px-1.5 py-0.5 rounded bg-[#161f36] border border-white/[0.08] text-cyan-300 font-mono text-[11px]">
                                      {children}
                                    </code>
                                  );
                                },
                              },
                              ul: {
                                component: ({ children }) => (
                                  <ul className="list-disc list-inside space-y-1 my-1.5 text-slate-300 text-xs">
                                    {children}
                                  </ul>
                                ),
                              },
                              ol: {
                                component: ({ children }) => (
                                  <ol className="list-decimal list-inside space-y-1 my-1.5 text-slate-300 text-xs">
                                    {children}
                                  </ol>
                                ),
                              },
                            },
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      ) : (
                        <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          <span>{t('aiDrawer.analyzing')}</span>
                        </div>
                      )}
                    </article>
                  )}

                  {/* Assistant Footer Action Chips */}
                  {!isUser && msg.content && (
                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>

                      <div className="flex items-center space-x-2">
                        {ticketDraft && (
                          <button
                            onClick={() => handleCopyTicket(msg.id, msg.content)}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/80 transition-colors cursor-pointer"
                            title="复制提取的工单模版"
                          >
                            {copiedTicketId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <FileCheck2 className="w-3 h-3 text-indigo-400" />
                            )}
                            <span>{copiedTicketId === msg.id ? t('aiDrawer.copiedTicket') : t('aiDrawer.copyTicket')}</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-[#161f36] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title={t('common.copy')}
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedMsgId === msg.id ? t('common.copied') : t('common.copy')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[#161f36] border border-white/[0.1] text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Error Message banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs font-mono space-y-2">
              <div className="flex items-center space-x-2 font-semibold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{t('aiDrawer.failed')}</span>
              </div>
              <p className="text-slate-300">{errorMsg}</p>
              <div className="pt-2 border-t border-rose-800/40 flex items-center gap-2">
                <button
                  onClick={onOpenSettings}
                  className="px-2.5 py-1 rounded bg-rose-900/60 text-white font-medium hover:bg-rose-800 transition-colors cursor-pointer"
                >
                  {t('aiDrawer.checkSettings')}
                </button>
                <button
                  onClick={() => report && startInitialTurn(report)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {t('aiDrawer.retry')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Action Chips & Input Box */}
        <div className="p-4 bg-[#0d1220] border-t border-white/[0.08] shrink-0 space-y-3">
          {/* Quick Prompt Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono scrollbar-none">
            <span className="text-slate-500 shrink-0 flex items-center gap-1 mr-1">
              <MessageSquare className="w-3 h-3 text-cyan-400" />
              {t('aiChat.quickChipsLabel')}
            </span>
            {quickChips.map((chip) => (
              <button
                key={chip.id}
                onClick={() => report && executeChatTurn(chip.text, messages, report)}
                disabled={status === 'generating'}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#141b2e] border border-white/[0.08] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-[#1a233b] transition-colors cursor-pointer disabled:opacity-40"
              >
                {chip.text}
              </button>
            ))}
          </div>

          {/* Textarea & Send Control */}
          <div className="relative rounded-xl bg-[#07090e] border border-white/[0.1] focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/40 transition-all">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={status === 'generating'}
              placeholder={t('aiChat.placeholder')}
              rows={2}
              className="w-full px-3.5 py-2.5 bg-transparent text-xs font-sans text-white placeholder-slate-500 focus:outline-none resize-none leading-relaxed"
            />

            <div className="px-3 pb-2 flex items-center justify-between text-xs font-mono">
              <span className="text-[10px] text-slate-500">
                {status === 'generating' ? (
                  <span className="text-cyan-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    {t('aiDrawer.analyzing')}
                  </span>
                ) : (
                  <span>Shift + Enter 换行 / Enter 发送</span>
                )}
              </span>

              <div className="flex items-center space-x-2">
                {status === 'generating' ? (
                  <button
                    onClick={handleStop}
                    className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-mono font-medium text-rose-300 bg-rose-950/60 border border-rose-500/40 hover:bg-rose-900/60 transition-colors cursor-pointer"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>{t('aiDrawer.stopGenerating')}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    className="inline-flex items-center space-x-1 px-3.5 py-1 rounded-lg text-xs font-mono font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 transition-colors disabled:opacity-40 cursor-pointer shadow-sm shadow-indigo-600/30"
                  >
                    <span>{t('aiChat.send')}</span>
                    <Send className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

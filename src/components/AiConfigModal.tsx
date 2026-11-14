import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Key,
  Globe,
  Sliders,
  ShieldCheck,
  Check,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Eye,
  EyeOff,
  Languages,
  Cpu,
  Server,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { AiConfig } from '../types/ai';
import { OllamaStatus } from '../types/sentinel';
import { PROVIDER_PRESETS, isUsingOfficialGateway } from '../services/aiConfig';
import { testAiConnection } from '../services/llmClient';
import { probeOllama } from '../services/tauri-bridge';
import { setAppLanguage } from '../i18n';

interface AiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AiConfig;
  onSave: (config: AiConfig) => void;
}

export const AiConfigModal: React.FC<AiConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const { t, i18n } = useTranslation();
  const [currentConfig, setCurrentConfig] = useState<AiConfig>({ ...config });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [isProbingOllama, setIsProbingOllama] = useState(false);

  // Probe Ollama on modal open if enabled
  React.useEffect(() => {
    if (isOpen && currentConfig.ollamaEnabled !== false) {
      handleProbeOllama();
    }
  }, [isOpen]);

  const handleProbeOllama = async () => {
    setIsProbingOllama(true);
    try {
      const res = await probeOllama(currentConfig.ollamaBaseUrl);
      setOllamaStatus(res);
      if (res.is_online && res.models.length > 0 && !currentConfig.ollamaModel) {
        setCurrentConfig((prev) => ({
          ...prev,
          ollamaModel: res.default_model || res.models[0],
        }));
      }
    } catch {
      setOllamaStatus(null);
    } finally {
      setIsProbingOllama(false);
    }
  };

  if (!isOpen) return null;

  const currentLang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en';

  const handleApplyPreset = (baseUrl: string, defaultModel: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      apiBaseUrl: baseUrl,
      model: defaultModel,
    }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection(currentConfig);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || (i18n.language.startsWith('zh') ? '测试连接失败' : 'Connection test failed'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSave(currentConfig);
    onClose();
  };

  const handleLanguageChange = (lng: 'zh-CN' | 'en') => {
    setAppLanguage(lng);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b0f1a] border border-white/[0.12] rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0e1322]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('aiConfig.title')}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {t('aiConfig.desc')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] text-xs font-mono">
          {/* Official Gateway Banner */}
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 font-sans">
              <div className="font-semibold text-xs text-emerald-300">
                {t('aiConfig.officialGatewayTitle')}
              </div>
              <div className="text-[11px] text-slate-300 leading-relaxed">
                {t('aiConfig.officialGatewayDesc')}
              </div>
            </div>
          </div>

          {/* Language Selector */}
          <div className="p-3.5 rounded-xl bg-[#080b13] border border-white/[0.08]">
            <label className="text-slate-300 font-medium flex items-center gap-1.5 mb-2">
              <Languages className="w-3.5 h-3.5 text-cyan-400" />
              {t('aiConfig.languageLabel')}
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleLanguageChange('zh-CN')}
                className={`flex-1 py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  currentLang === 'zh-CN'
                    ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300 font-bold ring-1 ring-cyan-500/40'
                    : 'bg-[#121828] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                简体中文 (zh-CN)
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`flex-1 py-2 px-3 rounded-lg border text-center transition-all cursor-pointer ${
                  currentLang === 'en'
                    ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300 font-bold ring-1 ring-cyan-500/40'
                    : 'bg-[#121828] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                English (en-US)
              </button>
            </div>
          </div>

          {/* Provider Presets */}
          <div>
            <label className="text-slate-400 uppercase tracking-wider text-[11px] font-semibold block mb-2">
              {t('aiConfig.presetsLabel')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROVIDER_PRESETS.map((p) => {
                const isSelected = currentConfig.apiBaseUrl === p.baseUrl;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p.baseUrl, p.defaultModel)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-200 ring-1 ring-cyan-500/40 shadow-sm'
                        : 'bg-[#080b13] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-[#111728]'
                    }`}
                  >
                    <div className="font-semibold text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{p.defaultModel}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Base URL */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              {t('aiConfig.apiBaseUrl')}
            </label>
            <input
              type="text"
              value={currentConfig.apiBaseUrl}
              onChange={(e) => setCurrentConfig({ ...currentConfig, apiBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#080b13] border border-white/[0.1] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40"
            />
            <span className="text-[10px] text-slate-500 block">
              {t('aiConfig.baseUrlHint')}
            </span>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              {t('aiConfig.apiKey')}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={currentConfig.apiKey}
                onChange={(e) => setCurrentConfig({ ...currentConfig, apiKey: e.target.value })}
                placeholder={isUsingOfficialGateway(currentConfig) ? t('aiConfig.apiKeyPlaceholder') : 'sk-...'}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#080b13] border border-white/[0.1] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[10px] text-slate-500 block">
              {t('aiConfig.apiKeyHint')}
            </span>
          </div>

          {/* Model & Temperature */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-violet-400" />
                {t('aiConfig.modelName')}
              </label>
              <input
                type="text"
                value={currentConfig.model}
                onChange={(e) => setCurrentConfig({ ...currentConfig, model: e.target.value })}
                placeholder="deepseek-chat / gpt-4o"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#080b13] border border-white/[0.1] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-slate-300 font-medium">{t('aiConfig.temperature')}</label>
                <span className="text-cyan-400 font-bold">{currentConfig.temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={currentConfig.temperature}
                onChange={(e) =>
                  setCurrentConfig({ ...currentConfig, temperature: parseFloat(e.target.value) })
                }
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2"
              />
              <span className="text-[10px] text-slate-500 block">
                {t('aiConfig.tempHint')}
              </span>
            </div>
          </div>

          {/* Data Sanitization Toggle */}
          <div className="p-3.5 rounded-xl bg-[#080b13] border border-white/[0.08] flex items-start space-x-3">
            <input
              type="checkbox"
              id="anonymize-toggle"
              checked={currentConfig.anonymizeData}
              onChange={(e) =>
                setCurrentConfig({ ...currentConfig, anonymizeData: e.target.checked })
              }
              className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4 bg-slate-900"
            />
            <label htmlFor="anonymize-toggle" className="cursor-pointer">
              <div className="text-white font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                {t('aiConfig.dataSanitization')}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('aiConfig.sanitizationDesc')}
              </p>
            </label>
          </div>

          {/* Module B: Offline Local LLM (Ollama) Failover */}
          <div className="p-3.5 rounded-xl bg-[#080b13] border border-cyan-500/20 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="ollama-toggle"
                  checked={currentConfig.ollamaEnabled !== false}
                  onChange={(e) =>
                    setCurrentConfig({ ...currentConfig, ollamaEnabled: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4 bg-slate-900"
                />
                <label htmlFor="ollama-toggle" className="cursor-pointer">
                  <div className="text-white font-semibold flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    {t('ollama.sectionTitle')}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {t('ollama.sectionDesc')}
                  </p>
                </label>
              </div>

              {ollamaStatus && (
                <div
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1 border shrink-0 ${
                    ollamaStatus.is_online
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400'
                  }`}
                >
                  {ollamaStatus.is_online ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3 h-3 text-slate-500" />
                  )}
                  <span>
                    {ollamaStatus.is_online
                      ? t('ollama.statusOnline', { count: ollamaStatus.models.length })
                      : t('ollama.statusOffline')}
                  </span>
                </div>
              )}
            </div>

            {currentConfig.ollamaEnabled !== false && (
              <div className="pt-2 border-t border-white/[0.06] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-[10px] block mb-1">
                      {t('ollama.baseUrlLabel')}
                    </label>
                    <input
                      type="text"
                      value={currentConfig.ollamaBaseUrl || 'http://127.0.0.1:11434/v1'}
                      onChange={(e) =>
                        setCurrentConfig({ ...currentConfig, ollamaBaseUrl: e.target.value })
                      }
                      placeholder="http://127.0.0.1:11434/v1"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e1322] border border-white/[0.1] text-white text-[11px] focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400 text-[10px]">
                        {t('ollama.modelLabel')}
                      </label>
                      <button
                        type="button"
                        onClick={handleProbeOllama}
                        disabled={isProbingOllama}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isProbingOllama ? 'animate-spin' : ''}`} />
                        <span>{t('ollama.detectModels')}</span>
                      </button>
                    </div>

                    {ollamaStatus && ollamaStatus.models.length > 0 ? (
                      <select
                        value={currentConfig.ollamaModel || ollamaStatus.models[0]}
                        onChange={(e) =>
                          setCurrentConfig({ ...currentConfig, ollamaModel: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e1322] border border-white/[0.1] text-cyan-300 text-[11px] focus:outline-none focus:border-cyan-500"
                      >
                        {ollamaStatus.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={currentConfig.ollamaModel || 'qwen2.5:latest'}
                        onChange={(e) =>
                          setCurrentConfig({ ...currentConfig, ollamaModel: e.target.value })
                        }
                        placeholder="qwen2.5:latest / llama3.2"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e1322] border border-white/[0.1] text-white text-[11px] focus:outline-none focus:border-cyan-500"
                      />
                    )}
                  </div>
                </div>

                {(!ollamaStatus || !ollamaStatus.is_online) && (
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Server className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{t('ollama.offlineHint')}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                testResult.success
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-[#0e1322] flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-slate-200 bg-[#161f36] border border-white/[0.1] hover:bg-[#1f2b4a] transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? t('common.testing') : t('common.test')}</span>
          </button>

          <div className="flex items-center space-x-2.5 font-mono">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 transition-colors shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{t('common.save')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

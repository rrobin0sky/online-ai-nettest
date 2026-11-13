import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Bot,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DiagnosticSummary } from '../types';

interface RcaBannerProps {
  summary: DiagnosticSummary | null;
  onOpenAiAnalysis?: () => void;
}

export const RcaBanner: React.FC<RcaBannerProps> = ({ summary, onOpenAiAnalysis }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!summary) return null;

  const severity = summary.overall_severity;
  const isCritical = severity === 'CRITICAL';
  const isDegraded = severity === 'DEGRADED';

  let borderGlow = 'border-emerald-500/30 bg-[#0a1219]/90 shadow-emerald-950/20';
  let badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let Icon = CheckCircle2;
  let iconColor = 'text-emerald-400';
  let severityLabel = t('common.normal');

  if (isCritical) {
    borderGlow = 'border-rose-500/40 bg-[#160c14]/90 shadow-rose-950/30 ring-1 ring-rose-500/20';
    badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse';
    Icon = AlertOctagon;
    iconColor = 'text-rose-400';
    severityLabel = t('common.critical');
  } else if (isDegraded) {
    borderGlow = 'border-amber-500/40 bg-[#17120a]/90 shadow-amber-950/30 ring-1 ring-amber-500/20';
    badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/50';
    Icon = ShieldAlert;
    iconColor = 'text-amber-400';
    severityLabel = t('common.degraded');
  }

  const categoryTranslationKey = `rca.domains.${summary.primary_cause_category}`;
  const translatedCategory = t(categoryTranslationKey, { defaultValue: summary.primary_cause_category });

  return (
    <section className={`rounded-2xl border ${borderGlow} p-5 backdrop-blur-md shadow-xl transition-all duration-300`}>
      {/* Top Banner Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className={`p-2.5 rounded-xl bg-black/40 border border-white/[0.08] ${iconColor} mt-0.5`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`text-[11px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-md border tracking-wider ${badgeStyle}`}>
                {severityLabel}
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#182138] border border-white/[0.1] text-cyan-300">
                {t('rca.rootCauseDomain')}: {translatedCategory}
              </span>
              <span className="text-xs font-mono text-slate-400">ID: {summary.id}</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">{summary.headline}</h2>
            <p className="text-xs text-slate-300 mt-1 max-w-4xl leading-relaxed">
              {summary.detailed_explanation}
            </p>
          </div>
        </div>

        {/* Action Callout Button */}
        <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
          {onOpenAiAnalysis && (
            <button
              onClick={onOpenAiAnalysis}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-colors shadow-md shadow-violet-700/25 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-300" />
              <span>{t('rca.aiExpertAnalysis')}</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 bg-white/[0.04] border border-white/[0.1] hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <span>{isExpanded ? t('rca.hideEvidence') : `${t('rca.viewEvidence')} (${summary.findings.length})`}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Actionable Remediation Box */}
      <div className="mt-4 pt-3.5 border-t border-white/[0.08] flex items-start space-x-2.5 text-xs">
        <div className="p-1 rounded bg-indigo-500/20 text-indigo-300 mt-0.5">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div>
          <span className="font-semibold text-indigo-300 uppercase tracking-wide text-[11px] font-mono">
            {t('rca.architectRemediation')}:
          </span>{' '}
          <span className="text-slate-300">{summary.actionable_recommendation}</span>
        </div>
      </div>

      {/* Triggered Rule Items Accordion */}
      {isExpanded && summary.findings.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
            {t('rca.triggeredEvidence')}:
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {summary.findings.map((f, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-start space-x-2.5 text-xs font-mono"
              >
                <div className="p-1 rounded bg-slate-800 text-slate-300 mt-0.5">
                  <Info className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      Stage {f.stage}
                    </span>
                    <span className="font-semibold text-white">{f.message}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{t('rca.rule')}: <code className="text-indigo-300">{f.rule_id}</code></p>
                  <p className="text-[11px] text-emerald-400/90 font-mono">{t('rca.evidence')}: {f.metric_evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

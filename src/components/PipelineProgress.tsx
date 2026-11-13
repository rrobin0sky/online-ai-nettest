import React from 'react';
import { Wifi, Globe, Activity, Zap, Cpu, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SeverityLevel } from '../types';

interface PipelineProgressProps {
  currentStage: number;
  onSelectStage: (stage: number) => void;
  affectedStages: number[];
  overallSeverity: SeverityLevel;
}

export const PipelineProgress: React.FC<PipelineProgressProps> = ({
  currentStage,
  onSelectStage,
  affectedStages,
  overallSeverity,
}) => {
  const { t } = useTranslation();

  const stages = [
    {
      id: 1,
      title: t('pipeline.stage1Title'),
      subtitle: t('pipeline.stage1Sub'),
      layer: 'L1/L2',
      icon: Wifi,
    },
    {
      id: 2,
      title: t('pipeline.stage2Title'),
      subtitle: t('pipeline.stage2Sub'),
      layer: 'L3/L7',
      icon: Globe,
    },
    {
      id: 3,
      title: t('pipeline.stage3Title'),
      subtitle: t('pipeline.stage3Sub'),
      layer: 'L3/L4',
      icon: Activity,
    },
    {
      id: 4,
      title: t('pipeline.stage4Title'),
      subtitle: t('pipeline.stage4Sub'),
      layer: 'L4 Transport',
      icon: Zap,
    },
    {
      id: 5,
      title: t('pipeline.stage5Title'),
      subtitle: t('pipeline.stage5Sub'),
      layer: 'L4/L7 Handshake',
      icon: Cpu,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stages.map((st) => {
        const Icon = st.icon;
        const isSelected = currentStage === st.id;
        const isAffected = affectedStages.includes(st.id);

        let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
        let statusText = t('common.healthy');
        let StatusIcon = CheckCircle2;
        let iconColor = 'text-emerald-400';

        if (isAffected) {
          if (overallSeverity === 'CRITICAL') {
            badgeColor = 'bg-rose-950/80 text-rose-300 border-rose-500/50 shadow-rose-900/30';
            statusText = t('common.bottleneck');
            StatusIcon = AlertOctagon;
            iconColor = 'text-rose-400';
          } else {
            badgeColor = 'bg-amber-950/80 text-amber-300 border-amber-500/50 shadow-amber-900/30';
            statusText = t('common.degraded');
            StatusIcon = AlertTriangle;
            iconColor = 'text-amber-400';
          }
        } else {
          badgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
        }

        return (
          <button
            key={st.id}
            onClick={() => onSelectStage(st.id)}
            className={`text-left p-3.5 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden ${
              isSelected
                ? 'bg-[#151c30] border-cyan-500/60 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30'
                : 'bg-[#0d121f] border-white/[0.08] hover:bg-[#12192c] hover:border-white/[0.15]'
            }`}
          >
            {/* Top Indicator */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                {st.layer}
              </span>
              <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${badgeColor}`}>
                <StatusIcon className="w-2.5 h-2.5" />
                <span>{statusText}</span>
              </div>
            </div>

            {/* Icon & Title */}
            <div className="flex items-center space-x-2.5">
              <div className={`p-2 rounded-lg bg-[#080b12] border border-white/[0.08] ${iconColor}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white tracking-tight">{st.title}</h4>
                <p className="text-[11px] text-slate-400 truncate max-w-[130px]">{st.subtitle}</p>
              </div>
            </div>

            {/* Active Highlight Line */}
            {isSelected && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-500" />
            )}
          </button>
        );
      })}
    </div>
  );
};

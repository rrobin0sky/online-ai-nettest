import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, X, Tag } from 'lucide-react';
import type { DiagnosticSnapshot } from '../types/history.ts';

interface PinBaselineModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: DiagnosticSnapshot | null;
  onConfirmPin: (snapshot: DiagnosticSnapshot, label: string) => void;
}

export const PinBaselineModal: React.FC<PinBaselineModalProps> = ({
  isOpen,
  onClose,
  snapshot,
  onConfirmPin,
}) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState('客户总部-正常工作日基线');

  if (!isOpen || !snapshot) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim()) {
      onConfirmPin(snapshot, label.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b0e18] border border-white/[0.12] rounded-2xl w-full max-w-md p-6 shadow-2xl font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {t('baseline.pinModalTitle', '设为黄金基线 (Pin as Golden Baseline)')}
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('baseline.pinModalSubtitle', '固化当前网络表现为标准参考基线')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              {t('baseline.labelPrompt', '基线标签 / 标识名称')}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：客户总部-正常工作日基线"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#07090e] border border-white/[0.12] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              autoFocus
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1">
            <p className="font-semibold">{t('baseline.noticeTitle', '★ 黄金基线特性说明：')}</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-200/80 text-[11px]">
              <li>{t('baseline.notice1', '独立持久化保存，不受 10 条 FIFO 历史轮转删除机制影响')}</li>
              <li>{t('baseline.notice2', '后续任意诊断均可与此基线一键进行 ASN 路径与时延对比')}</li>
              <li>{t('baseline.notice3', '自动注入 AI 研判上下文，辅助识别绕行与性能劣变')}</li>
            </ul>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-md shadow-amber-900/40 transition-all cursor-pointer"
            >
              {t('baseline.confirmPin', '确定锁定为基线')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check, FileText, Code2, DownloadCloud } from 'lucide-react';
import { CompleteDiagnosticReport } from '../types';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: CompleteDiagnosticReport | null;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'markdown' | 'json'>('markdown');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report) return null;

  const content =
    activeTab === 'markdown' ? report.summary.export_markdown : report.summary.export_json;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = activeTab === 'markdown' ? 'md' : 'json';
    const type = activeTab === 'markdown' ? 'text/markdown' : 'application/json';
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NetPath-Lens-Pro-${report.summary.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b0f1a] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0e1322]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('export.title')}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {t('export.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Format Toggle */}
            <div className="bg-[#07090e] p-0.5 rounded-lg border border-white/[0.08] flex items-center text-xs font-mono">
              <button
                onClick={() => setActiveTab('markdown')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'markdown'
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('export.markdown')}</span>
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'json'
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{t('export.json')}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto p-6 bg-[#07090e] font-mono text-xs text-slate-300 select-text">
          <pre className="whitespace-pre-wrap break-words leading-relaxed">{content}</pre>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.08] bg-[#0e1322] flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            {t('export.ticketId')}: <span className="text-cyan-400">{report.summary.id}</span>
          </span>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleCopy}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium text-white bg-[#1a2238] border border-white/[0.12] hover:bg-[#222c48] transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t('export.copied') : t('export.copyClipboard')}</span>
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 transition-colors shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>{t('export.downloadFile')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Disc, ExternalLink } from 'lucide-react';
import { SunoResponse } from '../../../../types';

interface AnalysisPanelProps {
    data: SunoResponse;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ data }) => {
    return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-3 text-indigo-400 shadow-sm">
                <Disc className="w-5 h-5" />
                <h3 className="font-semibold uppercase tracking-wider text-sm">分析結果 (Analysis)</h3>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">{data.analysis}</p>
            
            {data.tokenUsage && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-500">
                    <span className="font-semibold text-slate-400">📊 Token Usage:</span>
                    <span>Prompt: <span className="text-amber-400 font-mono">{data.tokenUsage.promptTokenCount.toLocaleString()}</span></span>
                    <span>Response: <span className="text-emerald-400 font-mono">{data.tokenUsage.candidatesTokenCount.toLocaleString()}</span></span>
                    <span>Total: <span className="text-indigo-400 font-mono">{data.tokenUsage.totalTokenCount.toLocaleString()}</span></span>
                </div>
            )}

            {data.sources && data.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                    <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
                        <ExternalLink className="w-3 h-3" />
                        参考ソース
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {data.sources.map((source, i) => (
                            <a
                                key={i}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 rounded flex items-center gap-1.5 transition-colors"
                            >
                                {source.title}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { FileText, Check, Loader2, ArrowRight } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface TitleCandidatesPanelProps {
    titles: string[];
    generatedTitles?: string[];
    onTitleSelect?: (title: string) => void;
    isGeneratingPhase2?: boolean;
}

export const TitleCandidatesPanel: React.FC<TitleCandidatesPanelProps> = ({
    titles,
    generatedTitles,
    onTitleSelect,
    isGeneratingPhase2,
}) => {
    return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-pink-400">
                    <FileText className="w-5 h-5" />
                    <h3 className="font-semibold uppercase tracking-wider text-sm">タイトル候補</h3>
                </div>
                {onTitleSelect && <span className="text-xs text-pink-300/60">タイトルを選んで生成 →</span>}
            </div>
            <ul className="space-y-3 flex-1">
                {titles.map((title, idx) => {
                    const isGenerated = generatedTitles?.includes(title);
                    return (
                        <li
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded-xl transition-colors group border ${isGenerated ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-slate-950/50 hover:bg-slate-800/50 border-transparent hover:border-pink-500/30'}`}
                        >
                            <span className={`text-sm flex-1 ${isGenerated ? 'text-emerald-300' : 'text-slate-200'}`}>
                                {isGenerated && <Check className="w-4 h-4 inline mr-2" />}
                                {title}
                            </span>
                            <div className="flex items-center gap-2">
                                <CopyButton text={title} />
                                {onTitleSelect && !isGenerated && (
                                    <button
                                        onClick={() => onTitleSelect(title)}
                                        disabled={isGeneratingPhase2}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-600/80 hover:bg-pink-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGeneratingPhase2 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                        生成
                                    </button>
                                )}
                                {isGenerated && <span className="text-xs text-emerald-400 font-bold">生成済み</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

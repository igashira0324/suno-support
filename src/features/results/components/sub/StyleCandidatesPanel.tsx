import React from 'react';
import { ListMusic } from 'lucide-react';
import { CopyButton } from './CopyButton';

interface StyleCandidatesPanelProps {
    styles: string[];
}

export const StyleCandidatesPanel: React.FC<StyleCandidatesPanelProps> = ({ styles }) => {
    return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-emerald-400">
                    <ListMusic className="w-5 h-5" />
                    <h3 className="font-semibold uppercase tracking-wider text-sm">スタイル候補</h3>
                </div>
            </div>
            <ul className="space-y-3 flex-1">
                {styles.map((style, idx) => (
                    <li
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/50 transition-colors group border border-transparent hover:border-slate-700"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs text-emerald-100 font-mono leading-relaxed">{style}</span>
                            <CopyButton text={style} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

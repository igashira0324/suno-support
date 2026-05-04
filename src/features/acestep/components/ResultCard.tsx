import React from 'react';
import { Download, Mic2, Music2, CheckCircle2 } from 'lucide-react';

interface ResultCardProps {
    file: { url: string; label: string };
    index: number;
    generatedTitle?: string;
    onDownload: (url: string, filename: string) => void;
    onStartVoiceChange: (url: string, idx: number, title?: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
    file,
    index,
    generatedTitle,
    onDownload,
    onStartVoiceChange
}) => {
    const title = generatedTitle || file.label || `Generated Song ${index + 1}`;

    return (
        <article className="group rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl overflow-hidden hover:border-indigo-500/40 transition-all">
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <Music2 className="w-5 h-5 text-indigo-400" />
                        </div>

                        <div className="min-w-0">
                            <h4 className="text-sm font-black text-slate-100 truncate">
                                {title}
                            </h4>
                            <div className="mt-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>#{index + 1} Synthesis Success</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => onDownload(file.url, `${title}_${index + 1}.wav`)}
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                            title="Download"
                        >
                            <Download className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => onStartVoiceChange(file.url, index, generatedTitle)}
                            className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 hover:text-white hover:bg-indigo-600 transition-all"
                            title="Voice Conversion"
                        >
                            <Mic2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="rounded-xl bg-slate-950/70 border border-white/5 p-3">
                    <audio
                        controls
                        preload="metadata"
                        className="w-full h-10 rounded-lg accent-indigo-500"
                    >
                        <source src={file.url} />
                        Your browser does not support the audio element.
                    </audio>
                </div>
            </div>
        </article>
    );
};

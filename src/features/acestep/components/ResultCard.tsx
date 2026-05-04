import React from 'react';
import { Download, Share2, Mic2 } from 'lucide-react';

interface ResultCardProps {
    file: { url: string; label: string };
    index: number;
    generatedTitle?: string;
    onDownload: (url: string, filename: string) => void;
    onStartVoiceChange: (url: string, idx: number, title?: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ file, index, generatedTitle, onDownload, onStartVoiceChange }) => {
    return (
        <div className="bg-slate-900/80 rounded-2xl p-5 border border-white/5 hover:border-indigo-500/30 transition-all group backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                    <h4 className="text-sm font-black text-slate-200 truncate">{generatedTitle || file.label}</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">#{index + 1} • Synthesis Success</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onDownload(file.url, `${generatedTitle || 'track'}_${index + 1}.wav`)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
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

            <div className="mt-5">
                <audio controls className="w-full h-10 rounded-lg accent-indigo-500 opacity-80 hover:opacity-100 transition-opacity">
                    <source src={file.url} type="audio/wav" />
                </audio>
            </div>
        </div>
    );
};

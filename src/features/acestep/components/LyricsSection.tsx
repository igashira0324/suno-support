import React from 'react';
import { Music, FileText, Wand2 } from 'lucide-react';
import { AceStepState } from '../types';

interface LyricsSectionProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
}

export const LyricsSection: React.FC<LyricsSectionProps> = ({ state, setState }) => {
    return (
        <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900/50 rounded-2xl p-6 border border-white/5 space-y-5 backdrop-blur-xl">
                <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Music className="w-4 h-4 text-indigo-400" />
                        Music Style / Prompt
                    </label>
                    <textarea
                        value={state.prompt}
                        onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 resize-none h-24"
                        placeholder="Describe the genre, mood, instruments..."
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-pink-400" />
                            Lyrics
                        </label>
                        <div className="flex gap-2">
                            <button className="px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-400 flex items-center gap-1 transition-colors">
                                <Wand2 className="w-3 h-3" /> Auto Structure
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={state.lyrics}
                        onChange={(e) => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500/50 transition-all placeholder:text-slate-600 h-64"
                        placeholder="[Verse 1]\nLyrics go here..."
                    />
                </div>
            </div>
        </div>
    );
};

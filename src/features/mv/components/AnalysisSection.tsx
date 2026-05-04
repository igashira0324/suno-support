import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, Music, Loader2 } from 'lucide-react';
import { AudioAnalysis, AudioSegment } from '../types';

interface AnalysisSectionProps {
    analysis: AudioAnalysis | null;
    isAnalyzing: boolean;
    onAnalyze: () => void;
    onSegmentClick: (segment: AudioSegment) => void;
}

export const AnalysisSection: React.FC<AnalysisSectionProps> = ({
    analysis,
    isAnalyzing,
    onAnalyze,
    onSegmentClick
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
            <div 
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-900/50 transition-all"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-emerald-400" />
                    <div>
                        <h3 className="text-sm font-bold text-white">Audio Analysis</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">BPM, Structure, and Intensity</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {!analysis && !isAnalyzing && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
                            className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                        >
                            Analyze Track
                        </button>
                    )}
                    {isAnalyzing && <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
            </div>

            {isExpanded && analysis && (
                <div className="p-6 pt-0 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">BPM</span>
                            <span className="text-xl font-bold text-white">{analysis.bpm || '---'}</span>
                        </div>
                        <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Key</span>
                            <span className="text-xl font-bold text-white">{analysis.key || '---'}</span>
                        </div>
                        <div className="bg-slate-900 p-4 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Segments</span>
                            <span className="text-xl font-bold text-white">{analysis.segments?.length || 0}</span>
                        </div>
                    </div>

                    {analysis.segments && (
                        <div className="space-y-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Detected Sections</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {analysis.segments.map((seg, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onSegmentClick(seg)}
                                        className="flex items-center justify-between p-3 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl transition-all text-left"
                                    >
                                        <div>
                                            <span className="text-[10px] font-bold text-emerald-400 block">{seg.label}</span>
                                            <span className="text-[9px] text-slate-500 font-mono">{(seg.end - seg.start).toFixed(1)}s</span>
                                        </div>
                                        <Music className="w-3 h-3 text-slate-700" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

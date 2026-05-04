import React from 'react';
import { X, Mic2, Music, Check, Loader2, Upload, Sparkles, Wand2 } from 'lucide-react';
import { VoiceChangeState } from '../types';

interface VoiceChangeDialogProps {
    voiceChange: VoiceChangeState;
    setVoiceChange: React.Dispatch<React.SetStateAction<VoiceChangeState>>;
    onClose: () => void;
    onConvert: () => void;
    onDownload: (url: string, filename: string) => void;
}

export const VoiceChangeDialog: React.FC<VoiceChangeDialogProps> = ({ voiceChange, setVoiceChange, onClose, onConvert, onDownload }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-900/20 to-purple-900/20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Mic2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">Voice Architect</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{voiceChange.songTitle || 'Selected Track'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                    {/* Status Tracker */}
                    <div className="flex items-center justify-between relative px-2">
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-800 -translate-y-1/2 z-0"></div>
                        {[
                            { step: 'separating', label: 'Stem separation', icon: Music },
                            { step: 'ready', label: 'Reference Voice', icon: Mic2 },
                            { step: 'converting', label: 'Neural Fusion', icon: Sparkles }
                        ].map((s, i) => {
                            const isDone = (voiceChange.status === 'ready' && i === 0) || (voiceChange.status === 'done');
                            const isActive = voiceChange.status === s.step;
                            return (
                                <div key={s.step} className="relative z-10 flex flex-col items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20 scale-110' : 'bg-slate-800 text-slate-500'}`}>
                                        {isDone ? <Check className="w-4 h-4" /> : <s.icon className="w-3.5 h-3.5" />}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>{s.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Content */}
                    {voiceChange.status === 'separating' && (
                        <div className="py-12 flex flex-col items-center justify-center space-y-6 text-center">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin relative z-10" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Separating Vocals & Instrumental</h4>
                                <p className="text-xs text-slate-500">Demucs v4 Neural Engine • {Math.round(voiceChange.progress * 100)}%</p>
                            </div>
                        </div>
                    )}

                    {(voiceChange.status === 'ready' || voiceChange.status === 'converting') && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Original Vocals</label>
                                    <audio src={voiceChange.vocalsUrl!} controls className="w-full h-8 accent-indigo-500" />
                                </div>
                                <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Instrumental</label>
                                    <audio src={voiceChange.instrumentalUrl!} controls className="w-full h-8 accent-slate-500" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <Upload className="w-3 h-3" /> Reference Voice (Target Model)
                                </label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        onChange={(e) => e.target.files && setVoiceChange(prev => ({ ...prev, newVocalsFile: e.target.files![0] }))}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${voiceChange.newVocalsFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-800 group-hover:border-slate-700 bg-slate-950/30'}`}>
                                        {voiceChange.newVocalsFile ? (
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                                                    <Mic2 className="w-5 h-5" />
                                                </div>
                                                <span className="text-sm font-bold text-slate-200">{voiceChange.newVocalsFile.name}</span>
                                            </div>
                                        ) : (
                                            <div className="text-center space-y-1">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Reference Voice</p>
                                                <p className="text-[10px] text-slate-600">Drag and drop or click to browse</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-white/5">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pitch Shift</label>
                                        <span className="text-[10px] font-mono text-indigo-400">{voiceChange.pitchShift > 0 ? '+' : ''}{voiceChange.pitchShift} st</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-12"
                                        max="12"
                                        step="1"
                                        value={voiceChange.pitchShift}
                                        onChange={(e) => setVoiceChange(prev => ({ ...prev, pitchShift: parseInt(e.target.value) }))}
                                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Inference Steps</label>
                                        <span className="text-[10px] font-mono text-indigo-400">{voiceChange.diffusionSteps}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10"
                                        max="100"
                                        step="1"
                                        value={voiceChange.diffusionSteps}
                                        onChange={(e) => setVoiceChange(prev => ({ ...prev, diffusionSteps: parseInt(e.target.value) }))}
                                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={onConvert}
                                disabled={!voiceChange.newVocalsFile || voiceChange.status === 'converting'}
                                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 overflow-hidden group"
                            >
                                {voiceChange.status === 'converting' ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Converting... {Math.round(voiceChange.progress * 100)}%
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                        Start Neural Conversion
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {voiceChange.status === 'done' && (
                        <div className="py-6 space-y-8 animate-in zoom-in-95 duration-500">
                            <div className="p-8 bg-indigo-600/10 rounded-3xl border border-indigo-500/20 text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-2">
                                    <Check className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-black text-white">Conversion Perfected</h4>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Processed in {voiceChange.processingTime?.toFixed(1)}s</p>
                                </div>
                                <audio src={voiceChange.mergedUrl!} controls className="w-full h-12 accent-indigo-500" autoPlay />
                                <button
                                    onClick={() => onDownload(voiceChange.mergedUrl!, `${voiceChange.songTitle || 'track'}_converted.mp3`)}
                                    className="w-full py-3 rounded-xl bg-white text-slate-900 font-bold uppercase tracking-widest hover:bg-indigo-50 transition-all"
                                >
                                    Download Result
                                </button>
                            </div>
                            <div className="flex justify-center">
                                <button onClick={() => setVoiceChange(prev => ({ ...prev, status: 'ready', mergedUrl: null }))} className="text-xs font-bold text-slate-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
                                    Convert another model
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

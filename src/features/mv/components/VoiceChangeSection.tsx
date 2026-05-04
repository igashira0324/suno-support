import React from 'react';
import { Mic2, MicOff, Settings2, Download, CheckCircle2, Loader2, AlertCircle, FileAudio } from 'lucide-react';
import { VoiceChangeState } from '../types';

interface VoiceChangeSectionProps {
    voiceChange: VoiceChangeState;
    onVoiceChangeStateUpdate: (update: Partial<VoiceChangeState>) => void;
    onConvert: () => void;
    onDownloadMerged: (e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string) => void;
}

export const VoiceChangeSection: React.FC<VoiceChangeSectionProps> = ({
    voiceChange,
    onVoiceChangeStateUpdate,
    onConvert,
    onDownloadMerged
}) => {
    return (
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 space-y-8 backdrop-blur-xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                        <Mic2 className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">RVC Voice Conversion</h3>
                        <p className="text-slate-500 text-sm">Replace original vocals with an AI model & auto-merge with instrumental.</p>
                    </div>
                </div>
                {voiceChange.status === 'done' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-xs font-bold animate-in zoom-in-95 duration-500">
                        <CheckCircle2 className="w-4 h-4" />
                        Conversion Ready
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Reference Voice Upload */}
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <MicOff className="w-3.5 h-3.5 text-indigo-400" />
                        Reference Audio (Your Voice Model)
                    </label>
                    <div className="relative group">
                        <input
                            type="file"
                            onChange={(e) => onVoiceChangeStateUpdate({ newVocalsFile: e.target.files?.[0] || null })}
                            accept="audio/*"
                            className="hidden"
                            id="vc-ref-upload"
                        />
                        <label
                            htmlFor="vc-ref-upload"
                            className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-3xl cursor-pointer transition-all ${
                                voiceChange.newVocalsFile 
                                    ? 'bg-indigo-500/5 border-indigo-500/50' 
                                    : 'bg-slate-950/50 border-slate-800 hover:border-indigo-500/50'
                            }`}
                        >
                            {voiceChange.newVocalsFile ? (
                                <>
                                    <div className="p-3 bg-indigo-500/20 rounded-xl mb-3">
                                        <FileAudio className="w-6 h-6 text-indigo-400" />
                                    </div>
                                    <span className="text-sm font-bold text-indigo-100">{voiceChange.newVocalsFile.name}</span>
                                    <span className="text-[10px] text-indigo-400/50 mt-1 font-mono uppercase">
                                        {(voiceChange.newVocalsFile.size / 1024 / 1024).toFixed(2)} MB • READY
                                    </span>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <UploadIcon className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-400">Choose Reference Audio</span>
                                </>
                            )}
                        </label>
                    </div>
                </div>

                {/* Parameters */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tuning Parameters</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diffusion Steps</span>
                                <span className="text-xs font-bold text-indigo-400">{voiceChange.diffusionSteps}</span>
                            </div>
                            <input
                                type="range" min="10" max="100" step="1"
                                value={voiceChange.diffusionSteps}
                                onChange={(e) => onVoiceChangeStateUpdate({ diffusionSteps: parseInt(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                        </div>

                        <div className="space-y-3 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pitch Shift</span>
                                <span className="text-xs font-bold text-indigo-400">{voiceChange.pitchShift > 0 ? `+${voiceChange.pitchShift}` : voiceChange.pitchShift}</span>
                            </div>
                            <input
                                type="range" min="-12" max="12" step="1"
                                value={voiceChange.pitchShift}
                                onChange={(e) => onVoiceChangeStateUpdate({ pitchShift: parseInt(e.target.value) })}
                                className="w-full accent-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-6 p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={voiceChange.f0Condition}
                                onChange={(e) => onVoiceChangeStateUpdate({ f0Condition: e.target.checked })}
                                className="w-4 h-4 rounded-md border-slate-800 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                            />
                            <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">F0 Condition</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={voiceChange.autoF0Adjust}
                                onChange={(e) => onVoiceChangeStateUpdate({ autoF0Adjust: e.target.checked })}
                                className="w-4 h-4 rounded-md border-slate-800 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                            />
                            <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">Auto F0</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Action Area */}
            <div className="pt-4 flex flex-col items-center gap-4">
                {voiceChange.status === 'converting' ? (
                    <div className="w-full max-w-md space-y-4">
                        <div className="flex items-center justify-between text-xs font-black text-indigo-400 uppercase tracking-widest">
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Processing Conversion...
                            </span>
                            <span>{voiceChange.progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                            <div 
                                className="h-full bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all duration-500" 
                                style={{ width: `${voiceChange.progress}%` }} 
                            />
                        </div>
                    </div>
                ) : voiceChange.status === 'done' && voiceChange.mergedUrl ? (
                    <div className="flex flex-wrap items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex flex-col items-center px-6 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Time Elapsed</span>
                            <span className="text-lg font-bold text-white font-mono">{voiceChange.processingTime?.toFixed(1)}s</span>
                        </div>
                        <a
                            href={voiceChange.mergedUrl}
                            onClick={(e) => onDownloadMerged(e, voiceChange.mergedUrl!, 'converted_merged.mp3')}
                            className="group flex items-center gap-3 px-10 py-5 bg-white text-slate-950 hover:bg-indigo-50 rounded-3xl font-black text-sm transition-all shadow-2xl shadow-indigo-500/20"
                        >
                            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            DOWNLOAD MASTER MIX
                        </a>
                        <button
                            onClick={onConvert}
                            className="px-8 py-5 bg-slate-900 text-slate-400 border border-slate-800 rounded-3xl font-bold text-sm hover:text-white hover:border-slate-700 transition-all"
                        >
                            Convert Again
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onConvert}
                        disabled={!voiceChange.newVocalsFile}
                        className="group relative px-16 py-5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-30 disabled:grayscale text-white rounded-3xl font-black text-sm transition-all shadow-2xl shadow-indigo-500/40 hover:shadow-indigo-500/60 overflow-hidden"
                    >
                        <div className="relative z-10 flex items-center gap-3">
                            <Mic2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            START VOICE CONVERSION
                        </div>
                    </button>
                )}

                {voiceChange.error && (
                    <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in shake duration-500">
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                        <span className="text-xs font-bold text-rose-400">{voiceChange.error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const UploadIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

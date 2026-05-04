import React from 'react';
import { Settings, Sliders, Cpu, Zap, Play, Loader2 } from 'lucide-react';
import { AceStepState } from '../types';

interface SettingsSectionProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
    onGenerate: () => void;
    visualProgress: number;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ state, setState, onGenerate, visualProgress }) => {
    return (
        <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-2xl p-5 border border-white/5 space-y-6 backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                    <Settings className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Settings</h3>
                </div>

                {/* Task Type */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Task Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                        {['text2music', 'cover', 'repaint', 'lego'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setState(prev => ({ ...prev, task_type: mode as any }))}
                                className={`px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${state.task_type === mode ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-400'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Parameters */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Steps
                            </label>
                            <span className="text-[10px] font-mono text-indigo-400">{state.inference_steps}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={state.inference_steps}
                            onChange={(e) => setState(prev => ({ ...prev, inference_steps: parseInt(e.target.value) }))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                <Cpu className="w-3 h-3" /> Model
                            </label>
                        </div>
                        <select
                            value={state.model}
                            onChange={(e) => setState(prev => ({ ...prev, model: e.target.value }))}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                        >
                            <option value="acestep-v15-base">ACE-Step v1.5 Base</option>
                            <option value="acestep-v15-xl">ACE-Step v1.5 XL</option>
                            <option value="suno-v4">Suno v4 Emulation</option>
                        </select>
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={onGenerate}
                    disabled={state.isGenerating}
                    className="relative w-full group overflow-hidden rounded-xl p-px"
                >
                    <div className={`absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 animate-gradient-x ${state.isGenerating ? 'opacity-50' : ''}`}></div>
                    <div className="relative bg-slate-950 rounded-[11px] py-4 flex flex-col items-center justify-center gap-1 group-hover:bg-transparent transition-all duration-300">
                        {state.isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">Generating {Math.round(visualProgress)}%</span>
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5 text-white fill-current" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white">Initialize Synthesis</span>
                            </>
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
};

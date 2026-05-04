import React, { useState } from 'react';
import { 
    Settings, 
    Sliders, 
    Cpu, 
    Zap, 
    Play, 
    Loader2, 
    ChevronDown, 
    ChevronUp, 
    Clock, 
    Globe, 
    Hash, 
    Brain,
    Info,
    Shield,
    Music2,
    Scissors,
    Layers
} from 'lucide-react';
import { AceStepState } from '../types';

interface SettingsSectionProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
    onGenerate: () => void;
    visualProgress: number;
    isAceStepReady?: boolean;
    healthError?: string | null;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ 
    state, 
    setState, 
    onGenerate, 
    visualProgress,
    isAceStepReady = true,
    healthError = null
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const getModeDescription = (mode: string) => {
        switch (mode) {
            case 'text2music': return 'テキストから新規楽曲を生成します。';
            case 'cover': return '既存の曲をベースにカバー版を作成します。';
            case 'repaint': return '曲の特定部分のみを再生成・修正します。';
            case 'lego': return 'トラックごとに分解・再構成を行います。';
            default: return '';
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-2xl p-5 border border-white/5 space-y-6 backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-slate-500" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Generation Settings</h3>
                    </div>
                    <div className="group relative">
                        <Info className="w-3.5 h-3.5 text-slate-600 cursor-help hover:text-indigo-400 transition-colors" />
                        <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-slate-900 border border-white/10 rounded-lg text-[9px] text-slate-400 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all z-10">
                            ACE-Step v1.5の詳細設定を行います。高品質な生成にはXLモデルと多めのStepsを推奨します。
                        </div>
                    </div>
                </div>

                {/* Task Type */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Task Mode</label>
                        <span className="text-[9px] text-slate-600 font-medium italic">{getModeDescription(state.task_type)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {['text2music', 'cover', 'repaint', 'lego'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setState(prev => ({ ...prev, task_type: mode as any }))}
                                className={`px-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex flex-col items-center gap-1 ${state.task_type === mode 
                                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                                    : 'bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-400'}`}
                            >
                                {mode === 'text2music' && <Music2 className="w-3 h-3 opacity-50" />}
                                {mode === 'cover' && <Layers className="w-3 h-3 opacity-50" />}
                                {mode === 'repaint' && <Scissors className="w-3 h-3 opacity-50" />}
                                {mode === 'lego' && <Sliders className="w-3 h-3 opacity-50" />}
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Primary Parameters */}
                <div className="space-y-5">
                    {/* Model Selection */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Cpu className="w-3 h-3 text-indigo-500" /> Model Selection
                            </label>
                        </div>
                        <select
                            value={state.model}
                            onChange={(e) => setState(prev => ({ ...prev, model: e.target.value }))}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2.5 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                        >
                            <option value="acestep-v15-turbo">ACE-Step v1.5 Turbo (推奨: 高速・高品質)</option>
                            <option value="acestep-v15-base">ACE-Step v1.5 Base (省メモリ)</option>
                            <option value="acestep-v15-xl">ACE-Step v1.5 XL (最高音質・表現力重視)</option>
                        </select>
                    </div>

                    {/* Inference Steps */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-amber-500" /> Inference Steps
                            </label>
                            <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">{state.inference_steps}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={state.inference_steps}
                            onChange={(e) => setState(prev => ({ ...prev, inference_steps: parseInt(e.target.value) }))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase tracking-tighter">
                            <span>Fast</span>
                            <span>Balanced</span>
                            <span>High Fidelity</span>
                        </div>
                    </div>

                    {/* Duration & Language */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-emerald-500" /> Duration
                            </label>
                            <select
                                value={state.duration}
                                onChange={(e) => setState(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                            >
                                <option value={-1}>Auto</option>
                                <option value={30}>30 Seconds</option>
                                <option value={60}>60 Seconds</option>
                                <option value={90}>90 Seconds</option>
                                <option value={120}>120 Seconds</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Globe className="w-3 h-3 text-blue-500" /> Language
                            </label>
                            <select
                                value={state.language}
                                onChange={(e) => setState(prev => ({ ...prev, language: e.target.value }))}
                                className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                            >
                                <option value="ja">Japanese</option>
                                <option value="en">English</option>
                                <option value="zh">Chinese</option>
                                <option value="ko">Korean</option>
                            </select>
                        </div>
                    </div>

                    {/* Style Preset */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                            <Music2 className="w-3 h-3 text-pink-500" /> Style Preset
                        </label>
                        <select
                            value={state.stylePreset}
                            onChange={(e) => setState(prev => ({ ...prev, stylePreset: e.target.value as any }))}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2.5 text-[10px] font-bold text-slate-300 focus:outline-none focus:ring-1 focus:ring-pink-500/50 transition-all"
                        >
                            <option value="none">None (Standard)</option>
                            <option value="suno">Suno Style (v4 Emulation)</option>
                            <option value="realistic">Hyper Realistic (High Fidelity)</option>
                            <option value="vintage">Lo-Fi Vintage (Warmth)</option>
                        </select>
                        <p className="text-[8px] text-slate-500 italic px-1">
                            {state.stylePreset === 'suno' && "Suno v4の音響特性を再現します。タグの自動調整が含まれます。"}
                            {state.stylePreset === 'realistic' && "スタジオ品質の高音質な設定。クリアな解像度を優先します。"}
                            {state.stylePreset === 'vintage' && "アナログ特有の温かみと質感を加えます。"}
                            {state.stylePreset === 'none' && "プロンプト通りの標準的な出力を生成します。"}
                        </p>
                    </div>
                </div>

                {/* Mode Specific Settings */}
                {state.task_type === 'cover' && (
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                                <Shield className="w-3 h-3" /> Audio Strength
                            </label>
                            <span className="text-[10px] font-mono text-indigo-400">{state.audio_cover_strength.toFixed(2)}</span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="0.9"
                            step="0.05"
                            value={state.audio_cover_strength}
                            onChange={(e) => setState(prev => ({ ...prev, audio_cover_strength: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-[8px] text-slate-500 leading-relaxed italic">低いとAIの自由度が高まり、高いと元の音源を忠実に再現します。</p>
                    </div>
                )}

                {state.task_type === 'repaint' && (
                    <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl space-y-3">
                        <div className="flex items-center gap-1.5 text-rose-400">
                            <Scissors className="w-3 h-3" />
                            <label className="text-[10px] font-black uppercase tracking-widest">Repaint Range (Seconds)</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Start</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={state.repainting_start}
                                    onChange={(e) => setState(prev => ({ ...prev, repainting_start: parseFloat(e.target.value) }))}
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-rose-300"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">End</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={state.repainting_end}
                                    onChange={(e) => setState(prev => ({ ...prev, repainting_end: parseFloat(e.target.value) }))}
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-rose-300"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                            <label className="text-[8px] text-slate-500 font-bold uppercase">Auto Trim</label>
                            <button 
                                onClick={() => setState(prev => ({ ...prev, autoTrim: !prev.autoTrim }))}
                                className={`w-7 h-3.5 rounded-full relative transition-colors ${state.autoTrim ? 'bg-rose-600' : 'bg-slate-700'}`}
                            >
                                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${state.autoTrim ? 'left-4' : 'left-0.5'}`} />
                            </button>
                        </div>
                    </div>
                )}

                {state.task_type === 'lego' && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-3">
                        <div className="flex items-center gap-1.5 text-amber-400">
                            <Sliders className="w-3 h-3" />
                            <label className="text-[10px] font-black uppercase tracking-widest">Lego Track Config</label>
                        </div>
                        <div className="space-y-2">
                            <span className="text-[8px] text-slate-500 font-bold uppercase">Track Name</span>
                            <select
                                value={state.legoTrackName}
                                onChange={(e) => setState(prev => ({ ...prev, legoTrackName: e.target.value }))}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-bold text-amber-300 focus:outline-none"
                            >
                                <option value="vocals">Vocals (ボーカル抽出)</option>
                                <option value="drums">Drums (ドラム抽出)</option>
                                <option value="bass">Bass (ベース抽出)</option>
                                <option value="other">Other (伴奏・その他)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-[8px] text-slate-500 font-bold uppercase">Time Shift</span>
                                <span className="text-[9px] font-mono text-amber-400">{state.shift}s</span>
                            </div>
                            <input
                                type="range"
                                min="-5"
                                max="5"
                                step="0.1"
                                value={state.shift}
                                onChange={(e) => setState(prev => ({ ...prev, shift: parseFloat(e.target.value) }))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            />
                        </div>
                    </div>
                )}

                {/* Advanced Settings Accordion */}
                <div className="space-y-2">
                    <button 
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 border border-white/5 transition-colors group"
                    >
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 group-hover:text-slate-300">
                            <Sliders className="w-3 h-3" /> Advanced Parameters
                        </span>
                        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5 text-slate-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600" />}
                    </button>

                    {showAdvanced && (
                        <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Guidance Scale */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Guidance Scale</label>
                                    <span className="text-[10px] font-mono text-indigo-400">{state.guidance_scale}</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="20"
                                    step="0.5"
                                    value={state.guidance_scale}
                                    onChange={(e) => setState(prev => ({ ...prev, guidance_scale: parseFloat(e.target.value) }))}
                                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <p className="text-[8px] text-slate-600 italic">プロンプトへの忠実度。高いほど指定に従いますが、音質が劣化する場合があります。</p>
                            </div>

                            {/* Seed Control */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                        <Hash className="w-3 h-3" /> Random Seed
                                    </label>
                                    <button 
                                        onClick={() => setState(prev => ({ ...prev, useRandomSeed: !prev.useRandomSeed }))}
                                        className={`w-8 h-4 rounded-full transition-all relative ${state.useRandomSeed ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${state.useRandomSeed ? 'left-4.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                {!state.useRandomSeed && (
                                    <input
                                        type="number"
                                        value={state.seed}
                                        onChange={(e) => setState(prev => ({ ...prev, seed: parseInt(e.target.value) }))}
                                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-indigo-300 focus:outline-none"
                                        placeholder="Enter seed value..."
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                {/* Batch Size */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Batch Size</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="4"
                                        value={state.batch_size}
                                        onChange={(e) => setState(prev => ({ ...prev, batch_size: parseInt(e.target.value) }))}
                                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[10px] font-mono text-indigo-300 focus:outline-none"
                                    />
                                </div>
                                {/* Thinking Mode */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                            <Brain className="w-3 h-3 text-pink-500" /> Thinking
                                        </label>
                                        <button 
                                            onClick={() => setState(prev => ({ ...prev, thinking: !prev.thinking }))}
                                            className={`w-8 h-4 rounded-full transition-all relative ${state.thinking ? 'bg-pink-600' : 'bg-slate-700'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${state.thinking ? 'left-4.5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                    <p className="text-[7px] text-slate-600 italic leading-tight">より高品質な生成のために追加の計算を行います。</p>
                                </div>
                            </div>

                            {/* Infer Method */}
                            <div className="space-y-2 pt-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Inference Method</label>
                                <div className="flex gap-2">
                                    {['ode', 'euler'].map(method => (
                                        <button
                                            key={method}
                                            onClick={() => setState(prev => ({ ...prev, infer_method: method as any }))}
                                            className={`flex-1 py-1 rounded border text-[9px] font-bold uppercase transition-all ${state.infer_method === method ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-900 border-transparent text-slate-600 hover:text-slate-400'}`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Generate Button */}
                <button
                    onClick={onGenerate}
                    disabled={state.isGenerating || !isAceStepReady}
                    className="relative w-full group overflow-hidden rounded-xl p-px transition-transform active:scale-[0.98]"
                >
                    <div className={`absolute inset-0 bg-gradient-to-r ${!isAceStepReady ? 'from-slate-700 to-slate-800' : 'from-indigo-600 via-purple-600 to-pink-600'} animate-gradient-x ${state.isGenerating || !isAceStepReady ? 'opacity-50' : ''}`}></div>
                    <div className="relative bg-slate-950 rounded-[11px] py-4 flex flex-col items-center justify-center gap-1 group-hover:bg-transparent transition-all duration-300">
                        {state.isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">Synthesizing {Math.round(visualProgress)}%</span>
                            </>
                        ) : !isAceStepReady ? (
                            <>
                                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {healthError || 'Service Offline'}
                                </span>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-2">
                                    <Play className="w-4 h-4 text-white fill-current" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Initialize Generation</span>
                                </div>
                                <span className="text-[8px] text-indigo-400/70 font-bold uppercase tracking-widest">ACE-Step v1.5 Engine</span>
                            </>
                        )}
                    </div>
                </button>
            </div>
        </div>
    );
};


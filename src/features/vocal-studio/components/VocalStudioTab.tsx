import React, { useRef } from 'react';
import { Upload, Music, Mic, FileAudio, Check, AlertCircle, Wand2, AudioLines, Sparkles, SlidersHorizontal, Info } from 'lucide-react';
import WaveformPlayer from '../../../components/WaveformPlayer';
import { useVocalStudio } from '../hooks/useVocalStudio';

export default function VocalStudioTab() {
    const { state, setState, handleFileSelect, handleGenerate } = useVocalStudio();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(e.target.files?.[0]);
    };

    const instrumentOptions = [
        { id: 'other', label: 'Other / Synth', desc: '推奨: メインボーカル以外のメロディ', icon: <AudioLines className="w-4 h-4" /> },
        { id: 'piano', label: 'Piano', desc: 'ピアノパートから抽出', icon: <Music className="w-4 h-4" /> },
        { id: 'guitar', label: 'Guitar', desc: 'ギターパートから抽出', icon: <SlidersHorizontal className="w-4 h-4" /> },
        { id: 'vocals', label: 'Vocals', desc: '既存ボーカルから上書き抽出', icon: <Mic className="w-4 h-4" /> }
    ] as const;

    return (
        <div className="w-full max-w-7xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header section */}
            <div className="text-center mb-12 space-y-4">
                <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 rounded-2xl mb-4 ring-1 ring-purple-500/30">
                    <Wand2 className="w-8 h-8 text-purple-400" />
                </div>
                <h1 className="text-5xl font-extrabold bg-gradient-to-br from-white via-purple-100 to-purple-400 bg-clip-text text-transparent tracking-tight">
                    カスタムAIボーカルスタジオ
                </h1>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    既存のインストゥルメンタル楽曲と歌詞から、AI技術（Audio-to-MIDI分離＆歌声合成）を用いて新しいボーカルトラックを生成し、完璧なミックスを作り出します。
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Inputs */}
                <div className="space-y-6">
                    {/* Upload Section */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-purple-400" />
                            1. インストゥルメンタルのアップロード
                        </h2>
                        
                        <div 
                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                                state.instrumentalFile 
                                    ? 'border-purple-500/50 bg-purple-500/5' 
                                    : 'border-slate-700 hover:border-purple-500/30 hover:bg-white/5'
                            }`}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={onFileChange}
                                accept="audio/*"
                                className="hidden"
                            />
                            {state.instrumentalFile ? (
                                <div className="space-y-4">
                                    <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto text-purple-400">
                                        <Music className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <p className="text-purple-300 font-medium truncate max-w-[250px] mx-auto">
                                            {state.instrumentalFile.name}
                                        </p>
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-sm text-slate-400 hover:text-white mt-2 underline decoration-dashed underline-offset-4"
                                            disabled={state.isProcessing}
                                        >
                                            ファイルを選び直す
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400 transition-transform group-hover:scale-110 duration-300">
                                        <Upload className="w-8 h-8" />
                                    </div>
                                    <p className="text-slate-300 font-medium">インスト音源をアップロード</p>
                                    <p className="text-sm text-slate-500">MP3, WAV, M4A に対応</p>
                                </div>
                            )}
                        </div>

                        {state.instrumentalUrl && (
                            <div className="mt-4 p-4 bg-slate-950/50 rounded-xl border border-white/5">
                                <WaveformPlayer src={state.instrumentalUrl} theme="purple" subtitle="Input Audio" />
                            </div>
                        )}
                    </div>

                    {/* Extractor Settings */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <AudioLines className="w-5 h-5 text-purple-400" />
                            2. ガイドメロディの抽出元
                        </h2>
                        <div className="flex items-start gap-2 mb-6">
                            <Info className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-slate-400">
                                インスト音源の中で「主旋律（メロディ）」を奏でている楽器を選択してください。Demucsを用いてそのパートを分离し、MIDIに自動変換します。
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            {instrumentOptions.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setState(prev => ({ ...prev, guideInstrument: opt.id as any }))}
                                    disabled={state.isProcessing}
                                    className={`p-4 rounded-xl border flex flex-col items-start gap-2 transition-all duration-300 text-left ${
                                        state.guideInstrument === opt.id 
                                            ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                                            : 'bg-slate-950/50 border-white/5 hover:border-purple-500/30'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg ${state.guideInstrument === opt.id ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-800 text-slate-400'}`}>
                                        {opt.icon}
                                    </div>
                                    <div>
                                        <div className={`font-semibold ${state.guideInstrument === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</div>
                                        <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Lyrics Input */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <FileAudio className="w-5 h-5 text-purple-400" />
                            3. 歌詞の入力
                        </h2>
                        <textarea
                            value={state.lyrics}
                            onChange={e => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                            placeholder="ここに歌詞を入力してください。AIが自動でタイミングを合わせて歌唱します..."
                            className="w-full h-48 bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none font-mono text-sm leading-relaxed"
                            disabled={state.isProcessing}
                        />
                    </div>
                </div>

                {/* Right Column: Processing & Output */}
                <div className="space-y-6">
                    {/* Action Panel */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl sticky top-6">
                        <div className="flex flex-col gap-6">
                            <button
                                onClick={handleGenerate}
                                disabled={state.isProcessing || !state.instrumentalFile || !state.lyrics.trim()}
                                className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 p-[2px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_40px_rgba(168,85,247,0.3)]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
                                <div className="relative bg-slate-900 rounded-[10px] px-6 py-4 flex items-center justify-center gap-3 transition-colors duration-300 group-hover:bg-opacity-0">
                                    {state.isProcessing ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span className="font-bold text-white text-lg tracking-wide">
                                                {state.status}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5 text-white" />
                                            <span className="font-bold text-white text-lg tracking-wide">
                                                ボーカルを生成してミックス
                                            </span>
                                        </>
                                    )}
                                </div>
                            </button>

                            {/* Progress & Error Status */}
                            <div className="space-y-4">
                                {state.isProcessing && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-medium">
                                            <span className="text-purple-300 animate-pulse">{state.status}</span>
                                            <span className="text-slate-400">{state.progress}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500 relative"
                                                style={{ width: `${state.progress}%` }}
                                            >
                                                <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {state.error && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                        <div className="text-sm text-red-300 break-words">{state.error}</div>
                                    </div>
                                )}
                            </div>

                            {/* Results Display */}
                            {(state.vocalUrl || state.mixUrl) && (
                                <div className="mt-8 space-y-6 pt-8 border-t border-white/10 animate-in fade-in slide-in-from-bottom-4">
                                    <div className="flex items-center gap-2 text-emerald-400 mb-4">
                                        <Check className="w-5 h-5" />
                                        <h3 className="text-xl font-bold">生成が完了しました！</h3>
                                    </div>

                                    {state.vocalUrl && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-slate-300 font-medium flex items-center gap-2">
                                                    <Mic className="w-4 h-4 text-purple-400" />
                                                    生成されたボーカル (Dry)
                                                </span>
                                                <a 
                                                    href={state.vocalUrl} 
                                                    download 
                                                    className="text-purple-400 hover:text-purple-300 hover:underline decoration-purple-400/30 underline-offset-4"
                                                >
                                                    ダウンロード
                                                </a>
                                            </div>
                                            <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5 shadow-inner">
                                                <WaveformPlayer src={state.vocalUrl} theme="purple" subtitle="Vocal Only" />
                                            </div>
                                        </div>
                                    )}

                                    {state.mixUrl && (
                                        <div className="space-y-2 pt-4">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-emerald-300 font-medium flex items-center gap-2">
                                                    <Music className="w-4 h-4" />
                                                    最終ミックス (Vocal + Inst)
                                                </span>
                                                <a 
                                                    href={state.mixUrl} 
                                                    download 
                                                    className="text-emerald-400 hover:text-emerald-300 hover:underline decoration-emerald-400/30 underline-offset-4"
                                                >
                                                    ダウンロード
                                                </a>
                                            </div>
                                            <div className="bg-slate-950/50 rounded-xl p-4 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                                                <WaveformPlayer src={state.mixUrl} theme="emerald" subtitle="Final Mix" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

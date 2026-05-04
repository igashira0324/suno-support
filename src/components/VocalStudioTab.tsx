import React, { useState, useRef } from 'react';
import { Upload, Music, Mic, FileAudio, Check, AlertCircle, Wand2, AudioLines, Sparkles, SlidersHorizontal, Info } from 'lucide-react';
import { VocalStudioState } from '../types';
import { toApiUrl } from '../api/client';
import WaveformPlayer from './WaveformPlayer';

const initialVocalStudioState: VocalStudioState = {
    instrumentalFile: null,
    instrumentalUrl: '',
    lyrics: '',
    guideInstrument: 'other',
    isProcessing: false,
    progress: 0,
    status: '',
    midiUrl: null,
    vocalUrl: null,
    mixUrl: null,
    error: null,
};

export default function VocalStudioTab() {
    const [state, setState] = useState<VocalStudioState>(initialVocalStudioState);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setState(prev => ({ ...prev, instrumentalFile: file, instrumentalUrl: url, error: null }));
        }
    };

    const handleGenerate = async () => {
        if (!state.instrumentalFile) {
            setState(prev => ({ ...prev, error: "Please upload an instrumental file." }));
            return;
        }
        if (!state.lyrics.trim()) {
            setState(prev => ({ ...prev, error: "Please enter lyrics." }));
            return;
        }

        setState(prev => ({ 
            ...prev, 
            isProcessing: true, 
            error: null, 
            status: 'アップロード中...', 
            progress: 10,
            midiUrl: null,
            vocalUrl: null,
            mixUrl: null
        }));

        try {
            // Step 1: Upload file
            const formData = new FormData();
            formData.append('file', state.instrumentalFile);
            
            const uploadRes = await fetch(toApiUrl('/acestep/upload-source'), {
                method: 'POST',
                body: formData
            });
            if (!uploadRes.ok) throw new Error("アップロードに失敗しました");
            const uploadData = await uploadRes.json();
            const filePath = uploadData.path;

            setState(prev => ({ ...prev, status: 'タスクを予約中...', progress: 20 }));

            // Step 2: Start SVS Task
            const startRes = await fetch(toApiUrl('/svs/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_url: filePath,
                    instrument: state.guideInstrument,
                    lyrics: state.lyrics
                })
            });

            if (!startRes.ok) {
                const err = await startRes.json();
                throw new Error(err.detail || "タスク開始に失敗しました");
            }

            const { task_id } = await startRes.json();
            
            // Step 3: Polling status
            const pollStatus = async () => {
                const statusRes = await fetch(toApiUrl(`/svs/status/${task_id}`));
                if (!statusRes.ok) throw new Error("ステータス取得に失敗しました");
                
                const task = await statusRes.json();
                
                if (task.status === 'completed') {
                    setState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        progress: 100, 
                        status: '生成完了！',
                        midiUrl: task.result.midi_url ? toApiUrl(task.result.midi_url) : null,
                        vocalUrl: task.result.vocal_url ? toApiUrl(task.result.vocal_url) : null,  
                        mixUrl: task.result.mix_url ? toApiUrl(task.result.mix_url) : null       
                    }));
                } else if (task.status === 'error') {
                    throw new Error(task.error || "生成タスク中にエラーが発生しました");
                } else {
                    setState(prev => ({ 
                        ...prev, 
                        status: task.status === 'processing' ? '楽器分離中...' : 
                                task.status === 'vocal_synthesis' ? 'ボーカル合成中...' :
                                task.status === 'mixing' ? '最終ミックス中...' : '処理中...',
                        progress: task.progress 
                    }));
                    // Poll again in 2 seconds
                    setTimeout(pollStatus, 2000);
                }
            };

            setTimeout(pollStatus, 2000);

        } catch (err: any) {
            setState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                error: err.message || "エラーが発生しました。"
            }));
        }
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
                                onChange={handleFileSelect}
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
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <FileAudio className="w-5 h-5 text-purple-400" />
                            3. 歌詞の入力
                        </h2>
                        <div className="relative">
                            <textarea
                                value={state.lyrics}
                                onChange={(e) => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                                placeholder="抽出したガイドメロディのノート数に合わせて歌詞を割り当てます。音節（シラブル）ごとにスペースで区切ると、より精確に合成されます。（例: あ い して る）"
                                className="w-full h-40 bg-slate-950/50 border border-white/10 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none font-mono text-sm leading-relaxed"
                                disabled={state.isProcessing}
                            />
                            <div className="absolute top-2 right-2 px-2 py-1 bg-slate-800/80 rounded border border-white/5 text-[10px] text-slate-400 font-mono">
                                {state.lyrics.length} chars
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Execution & Results */}
                <div className="space-y-6 flex flex-col">
                    <button
                        onClick={handleGenerate}
                        disabled={state.isProcessing || !state.instrumentalFile}
                        className={`relative w-full overflow-hidden rounded-2xl p-6 font-bold text-lg transition-all duration-300 shadow-xl flex items-center justify-center gap-3 ${
                            state.isProcessing || !state.instrumentalFile
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    >
                        {state.isProcessing && (
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/50 to-indigo-600/50 opacity-50 bg-[length:200%_200%] animate-[shimmer_2s_linear_infinite]" />
                        )}
                        <span className="relative flex items-center gap-2 z-10">
                            {state.isProcessing ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    {state.status}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-6 h-6" />
                                    自動抽出＆ボーカル合成を開始
                                </>
                            )}
                        </span>
                    </button>

                    {/* Progress Bar Component */}
                    {state.isProcessing && (
                        <div className="bg-slate-900/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-4">
                            <div className="flex justify-between items-center">
                                <span className="text-purple-300 font-medium tracking-wide">{state.status}</span>
                                <span className="text-purple-400 font-mono text-sm">{state.progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-500 relative"
                                    style={{ width: `${state.progress}%` }}
                                >
                                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]" />
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 font-mono text-center pt-2">
                                AI is separating stems and compiling MIDI...
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {state.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3 animate-in fade-in">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="text-sm font-medium leading-relaxed">{state.error}</div>
                        </div>
                    )}

                    {/* Results Area */}
                    <div className={`flex-1 bg-slate-900/50 backdrop-blur-xl border rounded-2xl p-6 shadow-2xl transition-all duration-500 flex flex-col ${
                        state.midiUrl || state.mixUrl ? 'border-purple-500/30' : 'border-white/5'
                    }`}>
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Check className={`w-5 h-5 ${state.mixUrl ? 'text-green-400' : 'text-slate-600'}`} />
                            4. 生成結果
                        </h2>

                        {!state.midiUrl && !state.mixUrl && !state.isProcessing && (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4 min-h-[200px]">
                                <FileAudio className="w-12 h-12 opacity-20" />
                                <p>結果はここに表示されます</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            {state.midiUrl && (
                                <div className="bg-slate-950/50 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
                                            <Music className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium text-sm">抽出されたガイドメロディ</p>
                                            <p className="text-xs text-slate-500 font-mono">MIDI Format</p>
                                        </div>
                                    </div>
                                    <a 
                                        href={state.midiUrl} 
                                        download 
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        MIDIを保存
                                    </a>
                                </div>
                            )}

                            {state.vocalUrl && (
                                <div className="bg-slate-950/50 border border-white/5 rounded-xl p-4 space-y-3">
                                    <h3 className="text-sm font-medium text-slate-300">合成ボーカル (Dry)</h3>
                                    <WaveformPlayer src={state.vocalUrl} theme="indigo" />
                                </div>
                            )}

                            {state.mixUrl && (
                                <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-purple-500/20 rounded-xl p-5 space-y-3 relative overflow-hidden shadow-xl">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full" />
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-400" />
                                        ファイナルミックス (Vocal + Instrumental)
                                    </h3>
                                    <WaveformPlayer src={state.mixUrl} theme="purple" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

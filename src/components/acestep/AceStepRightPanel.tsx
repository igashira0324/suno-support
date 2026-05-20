import React from 'react';
import { Play, Pause, Download, Music, AlertCircle, Loader2, FileAudio, Sparkles, Settings2, Languages, Clock, Layers, Image as ImageIcon, Upload, X, RefreshCw, Sliders, Mic, Merge, ArrowRight } from 'lucide-react';
import { AceStepComponentProps } from './types';
import WaveformPlayer from '../WaveformPlayer';

export const AceStepRightPanel: React.FC<AceStepComponentProps> = (props) => {
    const { 
        state, setState, visualProgress, processedAudioUrl, setProcessedAudioUrl, 
        voiceChangeState, setVoiceChangeState, isTurboModel, isBaseModel, 
        handleDownloadFile, handleStartVoiceChange, handleNewVocalsUpload, 
        handleConvertAndMerge, handleExtractLyrics, handleModelChange, 
        handleTaskTypeChange, handleCoverAudioUpload, handleCoverAudioDrop, 
        clearCoverAudio, handleReferenceAudioUpload, handleReferenceAudioDrop, 
        clearReferenceAudio, handleGenerate, handleImageUpload, handleDragOver, 
        handleDrop, clearImage, handleAnalyzeImage,
        isDownloading, onCancelVoiceChange,
    } = props;

    return (
        <>
            <div className={`w-full bg-slate-900/40 rounded-3xl border border-white/5 p-8 transition-all duration-700 ${state.status !== 'idle' ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4'}`}>
                <div className="max-w-4xl mx-auto space-y-10">
                    <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black text-slate-100 flex items-center gap-3">
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <FileAudio className="w-6 h-6 text-green-400" />
                            </div>
                            Studio Workspace / ワークスペース
                        </h3>
                        <div className="flex items-center gap-4">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${state.status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                                (state.status === 'failed' || state.error) ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                    'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse'
                                }`}>
                                {(state.status === 'failed' || state.error) ? 'Failed' : (state.status === 'idle' ? 'Ready' : state.status)}
                            </span>
                        </div>
                    </div>

                    {(state.status !== 'idle' && state.status !== 'failed' && !state.error) && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>Generating Composition / 作曲中...</span>
                                <span>{Math.round(visualProgress)}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                                <div
                                    className={`h-full transition-all duration-300 ease-out bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500`}
                                    style={{ width: `${visualProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Original Audio Preview (for Cover Mode) */}
                    {(state.task_type === 'cover' && (processedAudioUrl || state.isDownloadingSource) && state.status !== 'idle') && (
                        <div className="bg-slate-950/40 p-4 rounded-2xl border border-pink-500/20 space-y-3 relative overflow-hidden">
                            <label className="text-[10px] font-black uppercase tracking-widest text-pink-400 flex items-center gap-2">
                                <FileAudio className="w-3 h-3" />
                                Original Reference Audio / 元の楽曲
                            </label>
                            {state.isDownloadingSource ? (
                                <div className="w-full h-8 flex items-center justify-center bg-slate-900 rounded-lg">
                                    <div className="flex items-center gap-2 text-pink-400/80 text-xs font-bold font-mono animate-pulse">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        DOWNLOADING SOURCE AUDIO...
                                    </div>
                                </div>
                            ) : (
                                <audio
                                    controls
                                    src={processedAudioUrl || ''}
                                    className="w-full h-8 block rounded-lg focus:outline-none"
                                />
                            )}
                        </div>
                    )}

                    {state.output_files.length > 0 ? (
                        <div className="grid gap-6">
                            {state.output_files.map((item, idx) => (
                                <div key={idx} className="bg-slate-950/40 p-1 rounded-[2.5rem] border border-white/5 hover:border-indigo-500/30 transition-all group overflow-hidden shadow-2xl">
                                    <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                        <div className="flex flex-col gap-3 min-w-0 w-full md:w-1/3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black text-lg">
                                                    {idx + 1}
                                                </div>
                                                <span className="text-xl font-black text-slate-100 truncate pr-4">{state.prompt.split(',')[0]} (Variation {idx + 1})</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] bg-slate-900/80 px-2 py-1 rounded border border-white/5">{item.dit_model || state.model}</span>
                                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] bg-slate-900/80 px-2 py-1 rounded border border-white/5">SEED: {item.seed_value?.split(',')[idx] || '####'}</span>
                                                {state.processingTime && (
                                                    <span className="text-[9px] text-amber-500/80 font-black uppercase tracking-[0.2em] bg-slate-900/80 px-2 py-1 rounded border border-amber-500/20 flex items-center gap-1">
                                                        ⏱️ {state.processingTime.toFixed(1)}s
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="w-full md:flex-1">
                                            <WaveformPlayer
                                                src={item.url}
                                                title={state.generatedTitle || `${state.prompt.replace(/,/g, '').slice(0, 20)}...`}
                                                subtitle={`Variation ${idx + 1}`}
                                                theme={state.theme}
                                            />
                                        </div>
                                    </div>

                                    {/* Voice Change Section */}
                                    <div className="px-6 md:px-8 pb-6">
                                        {voiceChangeState.activeIndex !== idx ? (
                                            <button
                                                onClick={() => handleStartVoiceChange(item.url, idx, `${state.prompt?.split(',')[0]} (Variation ${idx + 1})`)}
                                                className="w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 bg-amber-600/10 text-amber-300 hover:bg-amber-600/20 border border-amber-500/20 hover:border-amber-500/40"
                                            >
                                                <Mic className="w-3.5 h-3.5" />
                                                Voice Change / ボーカル置換
                                            </button>
                                        ) : (

                                            <div className="space-y-3 p-4 bg-amber-950/20 rounded-xl border border-amber-500/20">
                                                <div className="flex items-center gap-2 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                                                    <Mic className="w-3.5 h-3.5" />
                                                    Voice Change Workflow / ボイスチェンジ
                                                </div>

                                                {/* Step 1: Separating */}
                                                {voiceChangeState.status === 'separating' && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-200">
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Separating Vocals & instrumental... / 音源分離中...
                                                            </div>
                                                            <span>{Math.round(voiceChangeState.progress)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                            <div
                                                                className="h-full transition-all duration-300 ease-out bg-gradient-to-r from-amber-500 to-orange-500"
                                                                style={{ width: `${voiceChangeState.progress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Step 2: Ready */}
                                                {voiceChangeState.status === 'ready' && (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-green-400">
                                                            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                                            Separation Complete / 分離完了
                                                        </div>

                                                        <div className="pt-3 border-t border-white/5 space-y-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                                    <Upload className="w-3 h-3" />
                                                                    Upload New Reference Voice / 変換先の声 (REC/File)
                                                                </label>
                                                                <div
                                                                    className={`relative w-full h-14 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${voiceChangeState.newVocalsFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}
                                                                >
                                                                    <input
                                                                        type="file"
                                                                        accept="audio/*"
                                                                        onChange={handleNewVocalsUpload}
                                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                    />
                                                                    {voiceChangeState.newVocalsFile ? (
                                                                        <div className="relative z-20 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-300 backdrop-blur-sm border border-amber-500/30">
                                                                            <FileAudio className="w-3 h-3" />
                                                                            {voiceChangeState.newVocalsFile.name}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-center space-y-0.5 pointer-events-none">
                                                                            <Upload className="w-3 h-3 mx-auto text-slate-600" />
                                                                            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-wider">Drop Voice Sample</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 space-y-4">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Pro Tuning / 詳細設定</span>
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    <div className="space-y-1.5">
                                                                        <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                                            <span>Diffusion Steps</span>
                                                                            <span className="text-indigo-400">{voiceChangeState.diffusionSteps}</span>
                                                                        </div>
                                                                        <input
                                                                            type="range" min="4" max="100" step="1"
                                                                            value={voiceChangeState.diffusionSteps}
                                                                            onChange={(e) => setVoiceChangeState(p => ({ ...p, diffusionSteps: parseInt(e.target.value) }))}
                                                                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                                        />
                                                                        <p className="text-[8px] text-slate-500 italic">Density/Quality. higher=better but slower. / 変換密度。高いほど高品質ですが時間がかかります。</p>
                                                                    </div>

                                                                    <div className="space-y-1.5">
                                                                        <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                                            <span>Pitch Shift (Semitones)</span>
                                                                            <span className={voiceChangeState.pitchShift === 0 ? "text-slate-500" : "text-amber-400"} >
                                                                                {voiceChangeState.pitchShift > 0 ? `+${voiceChangeState.pitchShift}` : voiceChangeState.pitchShift}
                                                                            </span>
                                                                        </div>
                                                                        <input
                                                                            type="range" min="-12" max="12" step="1"
                                                                            value={voiceChangeState.pitchShift}
                                                                            onChange={(e) => setVoiceChangeState(p => ({ ...p, pitchShift: parseInt(e.target.value) }))}
                                                                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                                        />
                                                                        <p className="text-[8px] text-slate-500 italic">Adjust vocal pitch. / 声の高さを半音単位で調整します。</p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-wrap gap-4 pt-2">
                                                                    <div className="space-y-1">
                                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                                            <div
                                                                                onClick={() => setVoiceChangeState(p => ({ ...p, f0Condition: !p.f0Condition }))}
                                                                                className={`w-8 h-4 rounded-full transition-colors relative ${voiceChangeState.f0Condition ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                                                            >
                                                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${voiceChangeState.f0Condition ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                            </div>
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">F0 Condition (SVC)</span>
                                                                        </label>
                                                                        <p className="text-[7px] text-slate-600 pl-10 italic">Better pitch tracking. / ピッチ追従性を向上させます。</p>
                                                                    </div>

                                                                    <div className="space-y-1">
                                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                                            <div
                                                                                onClick={() => setVoiceChangeState(p => ({ ...p, autoF0Adjust: !p.autoF0Adjust }))}
                                                                                className={`w-8 h-4 rounded-full transition-colors relative ${voiceChangeState.autoF0Adjust ? 'bg-amber-600' : 'bg-slate-700'}`}
                                                                            >
                                                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${voiceChangeState.autoF0Adjust ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                            </div>
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Auto Pitch Adjust</span>
                                                                        </label>
                                                                        <p className="text-[7px] text-slate-600 pl-10 italic">Align pitch to target. / 自動でピッチを補正します。</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="pt-2">
                                                                <button
                                                                    onClick={handleConvertAndMerge}
                                                                    disabled={!voiceChangeState.newVocalsFile}
                                                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${!voiceChangeState.newVocalsFile
                                                                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                                                        : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:shadow-amber-500/30 shadow-lg'
                                                                        }`}
                                                                >
                                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                                    Convert Voice & Merge / 声を変換して完成
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Step 3: Converting */}
                                                {voiceChangeState.status === 'converting' && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-200">
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Converting Voice & Merging... / 声を変換＆合成中...
                                                            </div>
                                                            <span>{Math.round(voiceChangeState.progress)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                            <div
                                                                className={`h-full transition-all duration-300 ease-out bg-gradient-to-r from-amber-500 to-orange-500`}
                                                                style={{ width: `${voiceChangeState.progress}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-amber-500/50 tracking-wider">
                                                            This may take 1-3 minutes depending on GPU. / GPUによって1〜3分かかる場合があります。
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Step 4: Done */}
                                                {voiceChangeState.status === 'done' && voiceChangeState.mergedUrl && (
                                                    <div className="space-y-3 animate-in zoom-in-95 duration-500">
                                                        <div className="flex items-center justify-between text-xs font-bold">
                                                            <div className="flex items-center gap-2 text-green-400">
                                                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                                                Voice Change Complete! / ボーカル置換完了！
                                                            </div>
                                                            {voiceChangeState.processingTime && (
                                                                <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded">
                                                                    ⏱️ {Math.floor(voiceChangeState.processingTime / 60)}m {Math.floor(voiceChangeState.processingTime % 60)}s
                                                                </span>
                                                            )}
                                                        </div>
                                                        <WaveformPlayer
                                                            src={voiceChangeState.mergedUrl!}
                                                            title={`Voice Changed: ${state.theme || 'Untitled'}`}
                                                            subtitle="Final Output"
                                                            theme={state.theme}
                                                        />
                                                        <a
                                                            href={voiceChangeState.mergedUrl}
                                                            onClick={(e) => {
                                                                const songTitle = voiceChangeState.songTitle || 'Generated_Song';
                                                                const singer = voiceChangeState.newVocalsFile?.name?.replace(/\.[^/.]+$/, "") || "Cover";
                                                                const safeName = `[${singer}]_${songTitle}.wav`.replace(/[\/\\?%*:|"<>]/g, '-');
                                                                if (voiceChangeState.mergedUrl) handleDownloadFile(e, voiceChangeState.mergedUrl, safeName);
                                                            }}
                                                            download="voice_changed_output.wav"
                                                            className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 bg-green-600/20 text-green-300 hover:bg-green-600/30 border border-green-500/20 ${isDownloading ? 'opacity-50 pointer-events-none' : ''}`}
                                                        >
                                                            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                            {isDownloading ? 'Downloading...' : 'Download Result / ダウンロード'}
                                                        </a>
                                                    </div>
                                                )}

                                                {/* Error State */}
                                                {voiceChangeState.status === 'failed' && (
                                                    <div className="p-3 bg-red-400/5 border border-red-400/20 rounded-xl flex items-center gap-2 text-red-400 text-[10px] font-medium animate-shake">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        <span>{voiceChangeState.error || 'Unknown Error'}</span>
                                                    </div>
                                                )}

                                                {/* Cancel / Reset Button */}
                                                {voiceChangeState.status !== 'done' && (
                                                    <div className="flex justify-center pt-2">
                                                        <button
                                                            onClick={onCancelVoiceChange}
                                                            className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                                                        >
                                                            Cancel / キャンセル
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : state.status === 'idle' ? (
                        <div className="py-20 flex flex-col items-center justify-center text-slate-600 space-y-4 border-2 border-dashed border-white/5 rounded-[3rem]">
                            <div className="p-6 bg-slate-900/50 rounded-full">
                                <Play className="w-10 h-10 opacity-20" />
                            </div>
                            <p className="text-sm font-black uppercase tracking-[0.3em] opacity-30">Waiting for generation / 待機中</p>
                        </div>
                    ) : null}
                </div>
            </div>

        </>
    );
};

import React from 'react';
import { Play, Pause, Download, Music, AlertCircle, Loader2, FileAudio, Sparkles, Settings2, Languages, Clock, Layers, Image as ImageIcon, Upload, X, RefreshCw, Sliders, Mic, Merge, ArrowRight } from 'lucide-react';
import { AceStepComponentProps } from './types';
import WaveformPlayer from '../WaveformPlayer';

export const AceStepLeftPanel: React.FC<AceStepComponentProps> = (props) => {
    const { 
        state, setState, visualProgress, processedAudioUrl, setProcessedAudioUrl, 
        voiceChangeState, setVoiceChangeState, isTurboModel, isBaseModel, 
        handleDownloadFile, handleStartVoiceChange, handleNewVocalsUpload, 
        handleConvertAndMerge, handleExtractLyrics, handleModelChange, 
        handleTaskTypeChange, handleCoverAudioUpload, handleCoverAudioDrop, 
        clearCoverAudio, handleReferenceAudioUpload, handleReferenceAudioDrop, 
        clearReferenceAudio, handleGenerate, handleImageUpload, handleDragOver, 
        handleDrop, clearImage, handleAnalyzeImage 
    } = props;

    // Simplified conditions for JSX
    const isGenerating = state.isGenerating;
    const isTaskCover = state.task_type === 'cover';
    const isTaskLego = state.task_type === 'lego';
    const isTaskRepaint = state.task_type === 'repaint';
    const isLyricsOriginal = state.coverLyricsMode === 'original';
    const isExtracting = state.isExtractingLyrics;
    const hasCoverAudio = !!(state.coverAudioUrl || state.coverAudioFile);
    
    const isGenerateDisabled = isGenerating || (isTaskCover && !hasCoverAudio);

    const isLegoVocals = state.legoTrackName === 'vocals';
    const isLegoBacking = state.legoTrackName === 'backing_vocals';

    return (
        <div className="lg:col-span-12 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                <div className="space-y-4 flex flex-col h-full">
                    <div className="bg-slate-950/20 rounded-2xl p-1">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                            <div className="relative bg-slate-900 rounded-xl p-4 border border-white/5 space-y-3">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        Image Inspiration
                                    </label>
                                    {state.imageFile && (
                                        <button onClick={clearImage} className="text-slate-500 hover:text-red-400 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <div
                                    className={`relative w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${state.imageFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                >
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    {state.imageFile ? (
                                        <>
                                            <img src={URL.createObjectURL(state.imageFile)} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                                            <div className="relative z-20 bg-slate-900/80 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-300 backdrop-blur-sm border border-indigo-500/30">
                                                {state.imageFile.name}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center space-y-1 pointer-events-none">
                                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                                                <Upload className="w-4 h-4" />
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upload Image</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleAnalyzeImage}
                                    disabled={!state.imageFile || state.isAnalyzing}
                                    className={`w-full py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${!state.imageFile ? 'bg-slate-800 text-slate-600 cursor-not-allowed' :
                                        state.isAnalyzing ? 'bg-indigo-600/50 text-indigo-200 cursor-wait' :
                                            'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                        }`}
                                >
                                    {state.isAnalyzing ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Analyze
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block pl-1">Song Description / 楽曲スタイル (Prompt)</label>
                            <textarea
                                value={state.prompt}
                                onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
                                className="w-full h-28 bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-sm resize-none placeholder:text-slate-700 transition-all font-medium leading-relaxed custom-scrollbar"
                                placeholder="Describe the style of music you want to generate..."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 flex items-center gap-1.5">
                                <Languages className="w-3 h-3" />
                                Vocal Language / 言語
                            </label>
                            <div className="relative">
                                <select
                                    value={state.language}
                                    onChange={(e) => setState(prev => ({ ...prev, language: e.target.value }))}
                                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-slate-200 appearance-none focus:ring-2 focus:ring-indigo-500/50 outline-none text-xs font-bold cursor-pointer"
                                >
                                    <option value="ja">Japanese (ja)</option>
                                    <option value="en">English (en)</option>
                                    <option value="zh">Chinese (zh)</option>
                                    <option value="ko">Korean (ko)</option>
                                    <option value="fr">French (fr)</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 flex items-center gap-1.5">
                                <Layers className="w-3 h-3" />
                                Model Version / モデル
                            </label>
                            <div className="relative">
                                <select
                                    value={state.model}
                                    onChange={(e) => handleModelChange(e.target.value)}
                                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-slate-200 appearance-none focus:ring-2 focus:ring-indigo-500/50 outline-none text-xs font-bold cursor-pointer"
                                >
                                    <option value="acestep-v15-xl-sft">v1.5 XL SFT (Best Quality/最高品質)</option>
                                    <option value="acestep-v15-xl-base">v1.5 XL Base (Lego/Cover/高機能)</option>
                                    <option value="acestep-v15-base">v1.5 Base (Legacy HQ/従来高品質)</option>
                                    <option value="acestep-v15-turbo">v1.5 Turbo (Fast/高速)</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Generation Mode / 生成モード
                                </label>
                                <p className="text-[10px] text-slate-500">
                                    {isTaskCover ? 'Arrange existing music' : isTaskLego ? 'Add vocals to BGM' : isTaskRepaint ? 'Extend audio' : 'Create new music'}
                                </p>
                            </div>
                            <div className="flex bg-slate-900/80 p-1 rounded-xl border border-white/5 w-fit ml-auto">
                                {['text2music', 'cover', 'repaint', 'lego'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => handleTaskTypeChange(type)}
                                        disabled={type === 'lego' && !isBaseModel(state.model)}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${state.task_type === type ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {type.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isTaskRepaint && (
                            <div className="space-y-4 pt-3 border-t border-white/5 animate-in slide-in-from-top-2">
                                <div className="flex bg-slate-800/50 p-1 rounded-lg">
                                    <button onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'upload' }))} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md ${state.coverAudioSourceType === 'upload' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>File Upload</button>
                                    <button onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'url' }))} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md ${state.coverAudioSourceType === 'url' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>URL Import</button>
                                </div>
                                
                                {state.coverAudioSourceType === 'upload' ? (
                                    <div className={`relative w-full h-16 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer ${state.coverAudioFile ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-700'}`}>
                                        <input type="file" accept="audio/*" onChange={handleCoverAudioUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                        {state.coverAudioFile ? <span className="text-xs font-bold text-cyan-300">{state.coverAudioFile.name}</span> : <span className="text-[10px] text-slate-500 uppercase">Upload Source Audio</span>}
                                    </div>
                                ) : (
                                    <input type="text" value={state.coverAudioUrl || ''} onChange={(e) => setState(prev => ({ ...prev, coverAudioUrl: e.target.value }))} placeholder="Audio URL" className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2 text-xs text-slate-200 outline-none" />
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-500 uppercase">Start (Sec)</label>
                                        <input type="number" value={state.repainting_start} onChange={(e) => setState(prev => ({ ...prev, repainting_start: parseFloat(e.target.value) }))} className="w-full bg-slate-900 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-500 uppercase">End (-1=Auto)</label>
                                        <input type="number" value={state.repainting_end} onChange={(e) => setState(prev => ({ ...prev, repainting_end: parseFloat(e.target.value) }))} className="w-full bg-slate-900 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {isTaskCover && (
                            <div className="space-y-4 pt-3 border-t border-white/5">
                                <div className="flex bg-slate-800/50 p-1 rounded-lg">
                                    <button onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'upload' }))} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md ${state.coverAudioSourceType === 'upload' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>File Upload</button>
                                    <button onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'url' }))} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md ${state.coverAudioSourceType === 'url' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>URL Import</button>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase text-slate-500">Cover Strength</label>
                                        <span className="text-[10px] font-mono text-pink-400 font-bold">{state.audio_cover_strength.toFixed(1)}</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.1" value={state.audio_cover_strength} onChange={(e) => setState(prev => ({ ...prev, audio_cover_strength: parseFloat(e.target.value) }))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-200">Thinking Mode</label>
                            <button
                                onClick={() => !isTurboModel(state.model) && setState(prev => ({ ...prev, thinking: !prev.thinking }))}
                                disabled={isTurboModel(state.model)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${state.thinking ? 'bg-indigo-600' : 'bg-slate-700'} ${isTurboModel(state.model) ? 'opacity-50' : ''}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${state.thinking ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Steps</label>
                                <input type="number" value={state.inference_steps} onChange={(e) => setState(prev => ({ ...prev, inference_steps: parseInt(e.target.value) }))} className="w-full bg-slate-900 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Duration</label>
                                <input type="number" value={state.duration} onChange={(e) => setState(prev => ({ ...prev, duration: parseInt(e.target.value) }))} className="w-full bg-slate-900 border border-white/5 rounded-lg px-2 py-1.5 text-xs text-slate-200" />
                            </div>
                        </div>

                        <details className="group cursor-pointer">
                            <summary className="flex items-center justify-between outline-none text-xs font-bold text-slate-300">
                                <span>Advanced Settings</span>
                                <Settings2 className="w-3.5 h-3.5" />
                            </summary>
                            <div className="pt-3 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 uppercase">Shift Factor</label>
                                    <input type="range" min="1.0" max="5.0" step="0.1" value={state.shift} onChange={(e) => setState(prev => ({ ...prev, shift: parseFloat(e.target.value) }))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-500 uppercase">Guidance Scale</label>
                                    <input type="range" min="1.0" max="15.0" step="0.1" value={state.guidance_scale} onChange={(e) => setState(prev => ({ ...prev, guidance_scale: parseFloat(e.target.value) }))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] text-slate-500 uppercase">Seed</label>
                                    <input type="number" value={state.seed === -1 ? '' : state.seed} onChange={(e) => setState(prev => ({ ...prev, seed: e.target.value === '' ? -1 : parseInt(e.target.value) }))} placeholder="Random (-1)" className="w-full bg-slate-900 border border-white/5 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200" />
                                </div>
                            </div>
                        </details>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerateDisabled}
                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all mt-4 ${isGenerateDisabled ? 'bg-slate-800 text-slate-500' : isTaskCover ? 'bg-pink-600 text-white' : 'bg-indigo-600 text-white'}`}
                    >
                        {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : isTaskCover ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isGenerating ? 'Processing...' : isTaskCover ? 'Create Cover' : 'Create Music'}
                    </button>
                </div>

                <div className="flex flex-col h-full bg-slate-950/20 rounded-2xl border border-white/5 p-4 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 mb-1.5 block">Theme / テーマ</label>
                        <textarea
                            value={state.theme}
                            onChange={(e) => setState(prev => ({ ...prev, theme: e.target.value }))}
                            className="w-full h-24 bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-slate-200 outline-none text-sm resize-none"
                            placeholder="Theme..."
                        />
                    </div>

                    <div className="space-y-2 flex-1 flex flex-col h-full overflow-hidden">
                        <label className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                            <Music className="w-3.5 h-3.5" /> Lyrics & Structure
                        </label>
                        <textarea
                            value={state.lyrics}
                            onChange={(e) => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                            className="w-full flex-1 bg-transparent border-none p-2 text-slate-200 outline-none resize-none font-mono text-xs overflow-y-auto"
                            placeholder="Lyrics here..."
                        />
                    </div>

                    {state.error && !isGenerating ? (
                        <div className="mt-6 bg-red-400/5 border border-red-400/20 text-red-400 p-4 rounded-xl text-xs flex items-center gap-3">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span className="font-bold">Error:</span> {state.error}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

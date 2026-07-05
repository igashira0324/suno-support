import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Music, Upload, Link2, X, Play, Pause, Loader2, FileAudio, Activity } from 'lucide-react';
import { AceStepState } from '../types';

interface SourceAudioSectionProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
    onExtractLyrics?: () => void;
    onAnalyzeProfile?: () => void;
}

export const SourceAudioSection: React.FC<SourceAudioSectionProps> = ({
    state,
    setState,
    onExtractLyrics,
    onAnalyzeProfile
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragOver, setIsDragOver] = useState(false);

    // Reset audio player when file or URL changes
    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.load();
        }
    }, [state.coverAudioFile, state.coverAudioUrl, state.coverAudioSourceType]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setState(prev => ({ 
                ...prev, 
                coverAudioFile: file,
                // Automatically set title based on file name if empty
                theme: prev.theme || file.name.replace(/\.[^/.]+$/, "")
            }));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('audio/')) {
                setState(prev => ({ 
                    ...prev, 
                    coverAudioFile: file,
                    theme: prev.theme || file.name.replace(/\.[^/.]+$/, "")
                }));
            } else {
                setState(prev => ({ ...prev, error: "オーディオファイルのみアップロード可能です。" }));
            }
        }
    };

    const clearAudio = () => {
        setState(prev => ({ 
            ...prev, 
            coverAudioFile: null, 
            coverAudioUrl: '' 
        }));
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => {
                setIsPlaying(true);
            }).catch(err => {
                console.error("Audio playback failed", err);
            });
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Playable source URL for preview. Memoized so a new blob URL is not created on
    // every render, and revoked on change to avoid leaking object URLs.
    const blobUrl = useMemo(
        () => (state.coverAudioFile ? URL.createObjectURL(state.coverAudioFile) : ''),
        [state.coverAudioFile]
    );
    useEffect(() => {
        return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
    }, [blobUrl]);

    const audioSource = state.coverAudioSourceType === 'upload'
        ? blobUrl
        : (state.coverAudioUrl || '');
    const hasAudio = state.coverAudioSourceType === 'upload' ? !!state.coverAudioFile : !!state.coverAudioUrl;

    return (
        <div className="bg-slate-900/50 rounded-2xl p-6 border border-white/5 space-y-4 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                        {(state.task_type === 'lego' || state.task_type === 'vocal_overlay')
                            ? 'Instrumental / BGM Audio (既存音源)'
                            : state.task_type === 'complete'
                                ? 'Vocal / Single Track (歌・単一トラック)'
                                : 'Source Audio (原曲・伴奏)'}
                    </h3>
                </div>
                <div className="flex bg-slate-950/80 rounded-lg p-0.5 border border-white/5">
                    <button
                        onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'upload' }))}
                        className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                            state.coverAudioSourceType === 'upload'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        File Upload
                    </button>
                    <button
                        onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'url' }))}
                        className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${
                            state.coverAudioSourceType === 'url'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        Audio URL
                    </button>
                </div>
            </div>

            {/* Upload Area */}
            {state.coverAudioSourceType === 'upload' && (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !state.coverAudioFile && fileInputRef.current?.click()}
                    className={`relative w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all overflow-hidden ${
                        state.coverAudioFile 
                            ? 'border-indigo-500/50 bg-indigo-500/5' 
                            : isDragOver
                                ? 'border-indigo-500 bg-indigo-600/10'
                                : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/20 cursor-pointer'
                    }`}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept="audio/*"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    {state.coverAudioFile ? (
                        <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                <FileAudio className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-slate-200 truncate max-w-[280px]">
                                    {state.coverAudioFile.name}
                                </p>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                    {(state.coverAudioFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearAudio();
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/80 border border-white/5 text-slate-400 hover:text-red-400 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-center space-y-2 pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
                                <Upload className="w-4 h-4" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                    {isDragOver ? 'Drop it here!' : 'Upload Audio File'}
                                </p>
                                <p className="text-[9px] text-slate-600 font-medium">
                                    Drag & drop or click to browse (MP3, WAV, FLAC, M4A)
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* URL Input Area */}
            {state.coverAudioSourceType === 'url' && (
                <div className="space-y-3">
                    <div className="relative">
                        <input
                            type="text"
                            value={state.coverAudioUrl}
                            onChange={(e) => setState(prev => ({ ...prev, coverAudioUrl: e.target.value }))}
                            placeholder="Enter direct audio URL (e.g. https://example.com/song.mp3)..."
                            className="w-full bg-slate-950/50 border border-slate-850 rounded-xl pl-10 pr-10 py-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-650"
                        />
                        <div className="absolute left-3 top-3.5 text-slate-600">
                            <Link2 className="w-4 h-4" />
                        </div>
                        {state.coverAudioUrl && (
                            <button
                                onClick={clearAudio}
                                className="absolute right-3 top-3 text-slate-500 hover:text-red-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Lyric Extraction for Cover/Lego */}
                    {onExtractLyrics && (
                        <button
                            onClick={onExtractLyrics}
                            disabled={!state.coverAudioUrl || state.isExtractingLyrics}
                            className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-pink-500/20 ${
                                !state.coverAudioUrl 
                                    ? 'bg-slate-950/20 text-slate-600 cursor-not-allowed border-transparent' 
                                    : state.isExtractingLyrics 
                                        ? 'bg-pink-600/20 text-pink-300 cursor-wait' 
                                        : 'bg-pink-600/10 hover:bg-pink-600/20 text-pink-400'
                            }`}
                        >
                            {state.isExtractingLyrics ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Extracting Lyrics...
                                </>
                            ) : (
                                <>
                                    <Music className="w-3.5 h-3.5" />
                                    Extract lyrics & style from URL
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* BPM / Key auto-analysis: locks generation metadata to the source track */}
            {onAnalyzeProfile && hasAudio && ['cover', 'repaint', 'complete'].includes(state.task_type) && (
                <button
                    onClick={onAnalyzeProfile}
                    disabled={state.isAnalyzingProfile}
                    className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-cyan-500/20 ${
                        state.isAnalyzingProfile
                            ? 'bg-cyan-600/20 text-cyan-300 cursor-wait'
                            : 'bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400'
                    }`}
                >
                    {state.isAnalyzingProfile ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Analyzing BPM / Key...
                        </>
                    ) : (
                        <>
                            <Activity className="w-3.5 h-3.5" />
                            曲情報を解析(BPM・キーを自動入力)
                        </>
                    )}
                </button>
            )}
            {(state.bpm || state.keyScale) && ['cover', 'repaint', 'complete'].includes(state.task_type) && (
                <p className="text-[9px] text-cyan-400/80 font-mono text-center">
                    🎵 {state.bpm ? `${state.bpm} BPM` : ''}{state.bpm && state.keyScale ? ' / ' : ''}{state.keyScale}
                    <span className="text-slate-600 ml-1">(生成時に固定されます)</span>
                </p>
            )}

            {/* Audio Preview Player */}
            {hasAudio && audioSource && (
                <div className="bg-slate-950/60 rounded-xl p-3 border border-white/5 flex items-center gap-3">
                    <button
                        onClick={togglePlay}
                        className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white transition-colors flex-shrink-0"
                    >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                    <div className="flex-grow min-w-0 space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 font-bold uppercase">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                        {/* Progress Bar */}
                        <div 
                            onClick={(e) => {
                                if (audioRef.current && duration) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const width = rect.width;
                                    audioRef.current.currentTime = (clickX / width) * duration;
                                }
                            }}
                            className="h-1 bg-slate-800 rounded-full cursor-pointer relative overflow-hidden"
                        >
                            <div 
                                className="h-full bg-indigo-500 transition-all duration-100" 
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                            />
                        </div>
                    </div>
                    
                    <audio
                        ref={audioRef}
                        src={audioSource}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleAudioEnded}
                        className="hidden"
                    />
                </div>
            )}
        </div>
    );
};

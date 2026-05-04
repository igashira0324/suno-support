import React from 'react';
import { Play, Pause, ZoomIn, ZoomOut, Volume2, Repeat, Scissors, Download, AlertCircle } from 'lucide-react';
import { TrackType } from '../types';

interface WaveformDisplayProps {
    waveformRef: React.RefObject<HTMLDivElement>;
    timelineRef: React.RefObject<HTMLDivElement>;
    isPlaying: boolean;
    onPlayPause: () => void;
    onZoom: (delta: number) => void;
    volume: number;
    onVolumeChange: (val: number) => void;
    isLooping: boolean;
    onToggleLoop: () => void;
    activeTrack: TrackType;
    onTrackChange: (track: TrackType) => void;
    currentTime: number;
    duration: number;
    wavesurferError: string | null;
    selectedRegion: { start: number, end: number } | null;
    onSetStartToCurrent: () => void;
    onSetEndToCurrent: () => void;
    onDownloadSegment: () => void;
    isDownloading: boolean;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
    waveformRef,
    timelineRef,
    isPlaying,
    onPlayPause,
    onZoom,
    volume,
    onVolumeChange,
    isLooping,
    onToggleLoop,
    activeTrack,
    onTrackChange,
    currentTime,
    duration,
    wavesurferError,
    selectedRegion,
    onSetStartToCurrent,
    onSetEndToCurrent,
    onDownloadSegment,
    isDownloading
}) => {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6">
            {/* Track Selector */}
            <div className="flex gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 w-fit">
                {(['original', 'vocals', 'instrumental'] as TrackType[]).map(t => (
                    <button
                        key={t}
                        onClick={() => onTrackChange(t)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            activeTrack === t 
                                ? 'bg-indigo-500 text-white shadow-lg' 
                                : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Waveform Container */}
            <div className="relative group bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden">
                {wavesurferError && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-6 text-center">
                        <div className="space-y-4">
                            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                            <p className="text-rose-400 text-sm font-medium">{wavesurferError}</p>
                        </div>
                    </div>
                )}
                
                <div ref={waveformRef} className="w-full" />
                <div ref={timelineRef} className="w-full opacity-50" />

                {/* Info Bar */}
                <div className="flex items-center justify-between px-6 py-3 bg-slate-900/50 border-t border-slate-800">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-indigo-400 font-mono tracking-tighter">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>
                    {selectedRegion && (
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-emerald-400 font-mono">
                                RANGE: {formatTime(selectedRegion.start)} - {formatTime(selectedRegion.end)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-6 bg-slate-900/30 p-6 rounded-3xl border border-white/5">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onPlayPause}
                        className="w-14 h-14 bg-white text-slate-950 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
                    >
                        {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current translate-x-0.5" />}
                    </button>
                    
                    <button
                        onClick={onToggleLoop}
                        className={`p-4 rounded-2xl border transition-all ${
                            isLooping 
                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-500/10' 
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                    >
                        <Repeat className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-900 px-4 py-3 rounded-2xl border border-slate-800">
                        <ZoomOut className="w-4 h-4 text-slate-500 cursor-pointer hover:text-white" onClick={() => onZoom(-1)} />
                        <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500" style={{ width: '50%' }}></div>
                        </div>
                        <ZoomIn className="w-4 h-4 text-slate-500 cursor-pointer hover:text-white" onClick={() => onZoom(1)} />
                    </div>

                    <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 rounded-2xl border border-slate-800">
                        <Volume2 className="w-4 h-4 text-slate-500" />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            className="w-24 accent-indigo-500"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={onSetStartToCurrent}
                        className="px-4 py-3 bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
                    >
                        Set Start
                    </button>
                    <button 
                        onClick={onSetEndToCurrent}
                        className="px-4 py-3 bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
                    >
                        Set End
                    </button>
                    <button
                        onClick={onDownloadSegment}
                        disabled={!selectedRegion || isDownloading}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
                    >
                        {isDownloading ? <span className="animate-spin text-lg">◌</span> : <Download className="w-4 h-4" />}
                        Trim & Save
                    </button>
                </div>
            </div>
        </div>
    );
};

import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Download, Volume2, VolumeX } from 'lucide-react';

interface WaveformPlayerProps {
    src: string;
    title?: string;
    subtitle?: string;
}

const WaveformPlayer: React.FC<WaveformPlayerProps> = ({ src, title, subtitle }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState('0:00');
    const [currentTime, setCurrentTime] = useState('0:00');
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showVolume, setShowVolume] = useState(false); // To toggle slider visibility on hover? Or just always show.

    useEffect(() => {
        if (!containerRef.current) return;

        wavesurfer.current = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(99, 102, 241, 0.4)', // Indigo-500/40
            progressColor: '#6366f1', // Indigo-500
            url: src,
            cursorColor: '#818cf8', // Indigo-400
            barWidth: 2,
            barGap: 3,
            height: 60,
            normalize: true,
            fetchParams: {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                mode: 'cors',
            },
        });

        // Set initial volume
        wavesurfer.current.setVolume(volume);

        wavesurfer.current.on('play', () => setIsPlaying(true));
        wavesurfer.current.on('pause', () => setIsPlaying(false));
        wavesurfer.current.on('ready', () => {
            const d = wavesurfer.current?.getDuration() || 0;
            setDuration(formatTime(d));
            wavesurfer.current?.setVolume(volume); // Ensure volume is set on ready
        });
        wavesurfer.current.on('timeupdate', (ct) => {
            setCurrentTime(formatTime(ct));
        });
        wavesurfer.current.on('finish', () => setIsPlaying(false));

        return () => {
            if (wavesurfer.current) {
                wavesurfer.current.destroy();
            }
        };
    }, [src]);

    // Volume effect
    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setVolume(isMuted ? 0 : volume);
        }
    }, [volume, isMuted]);

    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const secondsRemainder = Math.floor(seconds % 60);
        return `${minutes}:${secondsRemainder.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (wavesurfer.current) {
            wavesurfer.current.playPause();
        }
    };

    const [savedPath, setSavedPath] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Determine if src is a full URL or relative
            const apiUrl = "http://localhost:8100/save_file"; // Hardcoded port based on known config

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    file_url: src
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Failed to save file");
            }

            const data = await response.json();
            if (data.data && data.data.saved_path) {
                setSavedPath(data.data.saved_path);
                // Auto-hide after 10 seconds? Or keep it? User said "display path", implying persistence.
            }

        } catch (e: any) {
            console.error("Save failed:", e);
            alert(`保存に失敗しました: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col w-full gap-2">
            <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 flex gap-4 items-center group/player">
                <div className="flex flex-col items-center gap-3 shrink-0">
                    <button
                        onClick={togglePlay}
                        className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-lg shadow-indigo-500/20"
                    >
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>

                    {/* Volume Control (Below Play Button) */}
                    <div className="flex items-center justify-center group/volume relative w-full">
                        <div className="flex items-center justify-center bg-slate-950/50 rounded-lg p-1 border border-white/5 transition-all w-24">
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
                            >
                                {isMuted || volume === 0 ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={(e) => {
                                    setVolume(parseFloat(e.target.value));
                                    if (parseFloat(e.target.value) > 0) setIsMuted(false);
                                }}
                                className="w-14 h-1 mx-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {(title || subtitle) && (
                        <div className="mb-2 flex items-baseline justify-between">
                            <div className="truncate pr-4">
                                {title && <h4 className="text-sm font-bold text-white truncate">{title}</h4>}
                                {subtitle && <p className="text-[10px] text-slate-400 font-mono truncate">{subtitle}</p>}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                {currentTime} / {duration}
                            </span>
                        </div>
                    )}

                    <div ref={containerRef} className="w-full" />
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-10 h-10 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0 relative"
                    title="Save to Output Folder"
                >
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Download className="w-5 h-5" />
                    )}
                </button>
            </div>
            {savedPath && (
                <div className="mx-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Download className="w-3 h-3 text-green-400 shrink-0" />
                        <span className="text-[10px] text-green-400 font-mono truncate">
                            Saved: {savedPath}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            if (savedPath) navigator.clipboard.writeText(savedPath);
                            // Optional: show copied feedback
                        }}
                        className="text-[9px] text-green-500 hover:text-green-300 uppercase font-black tracking-wider ml-2 shrink-0"
                    >
                        Copy Path
                    </button>
                </div>
            )}
        </div>
    );
};

export default WaveformPlayer;

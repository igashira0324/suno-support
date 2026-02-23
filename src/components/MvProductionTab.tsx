import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, Mic2, MicOff, Loader2, Play, Pause, Download, AlertCircle, CheckCircle2, Scissors, Layers, ZoomIn, ZoomOut, Volume2, ArrowRight, Repeat, Square, Globe, Link, Settings2, FileAudio } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';

interface SeparationResult {
    vocals_url: string;
    instrumental_url: string;
    vocals_path: string;
    instrumental_path: string;
    original_path?: string;
}

interface TaskState {
    id: string | null;
    status: 'idle' | 'uploading' | 'downloading' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    error: string | null;
    result: SeparationResult | null;
    originalName?: string;
}

interface VoiceChangeState {
    status: 'idle' | 'converting' | 'done' | 'failed';
    taskId: string | null;
    progress: number;
    newVocalsFile: File | null;
    originalUrl?: string | null;
    mergedUrl: string | null;
    error: string | null;
    processingTime?: number;
    // Tuning Parameters
    diffusionSteps: number;
    pitchShift: number;
    f0Condition: boolean;
    autoF0Adjust: boolean;
}

type TrackType = 'original' | 'vocals' | 'instrumental';

// Audio Analysis Types
interface IntensityPoint {
    time: number;
    value: number;
}

interface AudioSegment {
    start: number;
    end: number;
    intensity: number;
    label: string;
}

interface AudioAnalysis {
    success: boolean;
    duration?: number;
    bpm?: number;
    key?: string;
    intensity_curve?: IntensityPoint[];
    segments?: AudioSegment[];
    error?: string;
}

// CLAP Search Types
interface CLAPResult {
    start: number;
    end: number;
    score: number;
    rank: number;
    label: string;
}

interface CLAPPreset {
    id: string;
    label: string;
    query: string;
}

interface CLAPSearchResponse {
    success: boolean;
    query?: string;
    results?: CLAPResult[];
    error?: string;
}

const MvProductionTab: React.FC = () => {
    const [state, setState] = useState<TaskState>({
        id: null,
        status: 'idle',
        progress: 0,
        error: null,
        result: null
    });

    const [voiceChange, setVoiceChange] = useState<VoiceChangeState>({
        status: 'idle',
        taskId: null,
        progress: 0,
        newVocalsFile: null,
        originalUrl: null,
        mergedUrl: null,
        error: null,
        diffusionSteps: 50,
        pitchShift: 0,
        f0Condition: true,
        autoF0Adjust: false
    });

    const vcPollRef = useRef<NodeJS.Timeout | null>(null);

    const [activeTrack, setActiveTrack] = useState<TrackType>('original');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLooping, setIsLooping] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [volume, setVolume] = useState(1.0);
    const [selectedRegion, setSelectedRegion] = useState<{ start: number, end: number } | null>(null);
    const [wavesurferError, setWavesurferError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Manual Input States
    const [startTimeInput, setStartTimeInput] = useState("--:--.--");
    const [endTimeInput, setEndTimeInput] = useState("--:--.--");

    // Audio Analysis States
    const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showIntensityCurve, setShowIntensityCurve] = useState(true);

    // CLAP Search States
    const [clapQuery, setClapQuery] = useState('');
    const [clapResults, setClapResults] = useState<CLAPResult[]>([]);
    const [clapPresets, setClapPresets] = useState<CLAPPreset[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [importUrl, setImportUrl] = useState('');

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const waveformRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsPluginRef = useRef<RegionsPlugin | null>(null);
    const wasPlayingRef = useRef(false);

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (wavesurferRef.current) {
                try {
                    wavesurferRef.current.destroy();
                } catch (e) { console.warn(e); }
            }
        };
    }, []);

    // Sync input fields when region changes
    useEffect(() => {
        if (selectedRegion) {
            setStartTimeInput(formatTime(selectedRegion.start, 2));
            setEndTimeInput(formatTime(selectedRegion.end, 2));
        } else {
            setStartTimeInput("--:--.--");
            setEndTimeInput("--:--.--");
        }
    }, [selectedRegion]);

    // Initialize WaveSurfer
    useEffect(() => {
        if (state.status === 'completed' && state.result && waveformRef.current && timelineRef.current) {
            if (wavesurferRef.current) {
                wasPlayingRef.current = wavesurferRef.current.isPlaying();
                setCurrentTime(wavesurferRef.current.getCurrentTime());
            }

            const timer = setTimeout(() => {
                initWaveSurfer();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [state.status, state.result, activeTrack]);

    const getTrackUrl = (type: TrackType) => {
        if (!state.result) return '';
        const baseUrl = 'http://localhost:8100';
        switch (type) {
            case 'vocals': return state.result.vocals_url ? `${baseUrl}${state.result.vocals_url}` : '';
            case 'instrumental': return state.result.instrumental_url ? `${baseUrl}${state.result.instrumental_url}` : '';
            case 'original':
            default:
                if (state.result.original_path?.startsWith('http')) return state.result.original_path;
                return state.result.original_path ? `${baseUrl}${state.result.original_path}` : '';
        }
    };

    const getTrackColor = (type: TrackType, isProgress: boolean) => {
        switch (type) {
            case 'vocals': return isProgress ? '#6366f1' : '#4338ca';
            case 'instrumental': return isProgress ? '#8b5cf6' : '#6d28d9';
            case 'original': return isProgress ? '#10b981' : '#059669';
            default: return isProgress ? '#cbd5e1' : '#475569';
        }
    };

    const initWaveSurfer = () => {
        if (!waveformRef.current || !timelineRef.current || !state.result) return;

        setWavesurferError(null);

        if (wavesurferRef.current) {
            try {
                wavesurferRef.current.destroy();
            } catch (e) {
                console.warn(e);
            }
            wavesurferRef.current = null;
        }

        const regions = RegionsPlugin.create();
        regionsPluginRef.current = regions;

        const timeline = TimelinePlugin.create({
            container: timelineRef.current,
            height: 20,
            timeInterval: 1, // 1秒ごとの目盛り
            primaryLabelInterval: 60, // 60秒ごとに数値ラベル
            secondaryLabelInterval: 10, // 10秒ごとに太線
            style: {
                color: '#94a3b8', // slate-400
                fontSize: '10px',
            },
            formatTimeCallback: (seconds: number) => {
                const min = Math.floor(seconds / 60);
                const sec = Math.floor(seconds % 60);
                return `${min}:${sec.toString().padStart(2, '0')}`;
            }
        });

        const url = getTrackUrl(activeTrack);
        if (!url) {
            setWavesurferError(`No URL for track: ${activeTrack}`);
            return;
        }

        try {
            const ws = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: getTrackColor(activeTrack, false),
                progressColor: getTrackColor(activeTrack, true),
                cursorColor: '#ffffff',
                barWidth: 2,
                barGap: 3,
                height: 128,
                url: url,
                plugins: [regions, timeline],
                normalize: true,
                minPxPerSec: 0,
                interact: true,
            });

            ws.on('ready', () => {
                const d = ws.getDuration();
                setDuration(d);
                ws.setVolume(volume);

                if (d > 300) {
                    ws.zoom(50);
                    setZoom(50);
                } else {
                    ws.zoom(0);
                    setZoom(0);
                }

                if (currentTime > 0) ws.setTime(currentTime);

                if (selectedRegion) {
                    regions.addRegion({
                        start: selectedRegion.start,
                        end: selectedRegion.end,
                        color: 'rgba(255, 255, 255, 0.2)',
                        drag: true,
                        resize: true
                    });
                }

                if (wasPlayingRef.current) {
                    ws.play();
                    setIsPlaying(true);
                }
            });

            ws.on('error', (err) => {
                console.error("WaveSurfer error:", err);
                setWavesurferError(`Waveform Error: ${err.message || err}`);
            });

            ws.on('audioprocess', () => {
                setCurrentTime(ws.getCurrentTime());
            });

            ws.on('play', () => setIsPlaying(true));
            ws.on('pause', () => setIsPlaying(false));
            ws.on('finish', () => setIsPlaying(false));

            regions.on('region-created', (region) => {
                regions.getRegions().forEach(r => { if (r.id !== region.id) r.remove(); });
                setSelectedRegion({ start: region.start, end: region.end });
            });

            regions.on('region-updated', (region) => {
                setSelectedRegion({ start: region.start, end: region.end });
            });

            regions.on('region-out', (region) => {
                if (isLoopingRef.current) {
                    region.play();
                }
            });

            regions.enableDragSelection({ color: 'rgba(255, 255, 255, 0.2)' });

            wavesurferRef.current = ws;
        } catch (e: any) {
            console.error("Failed:", e);
            setWavesurferError(`Init Error: ${e.message || e}`);
        }
    };

    const isLoopingRef = useRef(isLooping);
    useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

    const handlePlayPause = () => wavesurferRef.current?.playPause();
    const handleZoom = (delta: number) => {
        if (!wavesurferRef.current) return;
        let newZoom = zoom;
        if (zoom === 0) newZoom = 50;
        else newZoom = Math.max(1, Math.min(200, zoom + delta * 10));
        setZoom(newZoom);
        wavesurferRef.current.zoom(newZoom);
    };
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        wavesurferRef.current?.setVolume(val);
    };
    const toggleLoop = () => setIsLooping(!isLooping);

    const handleSetStartToCurrent = () => {
        if (!regionsPluginRef.current || !wavesurferRef.current) return;
        const current = wavesurferRef.current.getCurrentTime();
        if (selectedRegion) {
            const end = Math.max(current + 0.1, selectedRegion.end);
            regionsPluginRef.current.clearRegions();
            regionsPluginRef.current.addRegion({ start: current, end: end, color: 'rgba(255, 255, 255, 0.2)' });
        } else {
            regionsPluginRef.current.addRegion({ start: current, end: current + 5, color: 'rgba(255, 255, 255, 0.2)' });
        }
    };
    const handleSetEndToCurrent = () => {
        if (!regionsPluginRef.current || !wavesurferRef.current || !selectedRegion) return;
        const current = wavesurferRef.current.getCurrentTime();
        const start = Math.min(current - 0.1, selectedRegion.start);
        regionsPluginRef.current.clearRegions();
        regionsPluginRef.current.addRegion({ start: start, end: current, color: 'rgba(255, 255, 255, 0.2)' });
    };

    const parseTime = (timeStr: string) => {
        try {
            const parts = timeStr.split(':');
            if (parts.length !== 2) return null;
            const min = parseInt(parts[0]);
            const sec = parseFloat(parts[1]);
            if (isNaN(min) || isNaN(sec)) return null;
            return min * 60 + sec;
        } catch { return null; }
    };

    const handleManualRegionUpdate = () => {
        if (!regionsPluginRef.current) return;
        const start = parseTime(startTimeInput);
        const end = parseTime(endTimeInput);

        if (start !== null && end !== null && start < end) {
            regionsPluginRef.current.clearRegions();
            regionsPluginRef.current.addRegion({ start, end, color: 'rgba(255, 255, 255, 0.2)' });
        }
    };

    const handleCancel = async () => {
        if (!state.id || isCancelling) return;
        setIsCancelling(true);
        try {
            await fetch(`http://localhost:8100/task/${state.id}/cancel`, { method: 'POST' });
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setState(prev => ({ ...prev, status: 'cancelled', progress: 0 }));
            // Optional: wait a bit then go back to idle? Or stay in cancelled state?
            // Go back to idle immediately
            setTimeout(() => {
                setState(prev => ({ ...prev, status: 'idle', id: null, progress: 0, result: null }));
                setIsCancelling(false);
            }, 1000);
        } catch (e) {
            console.error(e);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setState(prev => ({ ...prev, status: 'idle', id: null, progress: 0, result: null }));
            setIsCancelling(false);
        }
    };

    const handlePlayLoop = () => {
        if (!selectedRegion || !wavesurferRef.current) return;
        setIsLooping(true);
        wavesurferRef.current.setTime(selectedRegion.start);
        wavesurferRef.current.play();
    };

    // Audio Analysis Functions
    const analyzeCurrentTrack = async () => {
        if (!state.result) return;

        const trackUrl = activeTrack === 'original'
            ? state.result.original_path
            : activeTrack === 'vocals'
                ? state.result.vocals_url
                : state.result.instrumental_url;

        if (!trackUrl) return;

        setIsAnalyzing(true);
        try {
            const response = await fetch('http://localhost:8100/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: trackUrl })
            });

            if (!response.ok) throw new Error('Analysis failed');

            const data: AudioAnalysis = await response.json();
            setAudioAnalysis(data);
        } catch (e) {
            console.error('Audio analysis error:', e);
            setAudioAnalysis(null);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSegmentClick = (segment: AudioSegment) => {
        if (!regionsPluginRef.current) return;
        regionsPluginRef.current.clearRegions();
        regionsPluginRef.current.addRegion({
            start: segment.start,
            end: segment.end,
            color: 'rgba(255, 255, 255, 0.2)',
            drag: true,
            resize: true
        });
        setSelectedRegion({ start: segment.start, end: segment.end });
    };

    // CLAP Search Functions
    const loadClapPresets = async () => {
        try {
            const response = await fetch('http://localhost:8100/clap/presets');
            if (response.ok) {
                const data = await response.json();
                setClapPresets(data.presets || []);
            }
        } catch (e) {
            console.error('Failed to load CLAP presets:', e);
        }
    };

    const handleClapSearch = async (query?: string) => {
        if (!state.result) return;
        const searchQuery = query || clapQuery;
        if (!searchQuery.trim()) return;

        const trackUrl = activeTrack === 'original'
            ? state.result.original_path
            : activeTrack === 'vocals'
                ? state.result.vocals_url
                : state.result.instrumental_url;

        if (!trackUrl) return;

        setIsSearching(true);
        setClapResults([]);
        try {
            const response = await fetch('http://localhost:8100/clap/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: trackUrl,
                    query: searchQuery,
                    window_sec: 5.0,
                    top_k: 5
                })
            });

            if (!response.ok) throw new Error('CLAP search failed');

            const data: CLAPSearchResponse = await response.json();
            if (data.success && data.results) {
                setClapResults(data.results);
            }
        } catch (e) {
            console.error('CLAP search error:', e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleClapResultClick = (result: CLAPResult) => {
        if (!regionsPluginRef.current) return;
        regionsPluginRef.current.clearRegions();
        regionsPluginRef.current.addRegion({
            start: result.start,
            end: result.end,
            color: 'rgba(99, 102, 241, 0.3)', // Indigo highlight for CLAP results
            drag: true,
            resize: true
        });
        setSelectedRegion({ start: result.start, end: result.end });
    };

    const handleDownloadSegment = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!selectedRegion || !state.result || isDownloading) return;
        setIsDownloading(true);
        const trackUrl = getTrackUrl(activeTrack);
        try {
            const path = new URL(trackUrl).pathname;
            const formData = new FormData();
            formData.append('file_path', path);
            formData.append('start_time', selectedRegion.start.toString());
            formData.append('end_time', selectedRegion.end.toString());

            const response = await fetch('http://localhost:8100/trim', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Download failed ' + response.statusText);

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `trim_${activeTrack}_${Math.floor(selectedRegion.start)}-${Math.floor(selectedRegion.end)}.wav`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error(error);
            alert("Download failed: " + error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadFile = async (e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string) => {
        e.preventDefault();
        if (!url || isDownloading) return;
        setIsDownloading(true);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Download failed ' + response.statusText);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error(error);
            alert("Download failed: " + error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setState({ id: null, status: 'uploading', progress: 0, error: null, result: null });
        setActiveTrack('original');
        wasPlayingRef.current = false;
        setCurrentTime(0);
        setSelectedRegion(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('http://localhost:8100/separate', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to upload file');

            const data = await response.json();
            setState(prev => ({ ...prev, id: data.task_id, status: 'queued', originalName: file.name }));
            startPolling(data.task_id);
        } catch (err: any) {
            setState(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const handleUrlImport = async () => {
        if (!importUrl.trim()) return;

        setState({ id: null, status: 'downloading', progress: 0, error: null, result: null });
        setActiveTrack('original');
        wasPlayingRef.current = false;
        setCurrentTime(0);
        setSelectedRegion(null);

        try {
            const response = await fetch('http://localhost:8100/separate-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: importUrl })
            });

            if (!response.ok) throw new Error('Failed to start URL import');

            const data = await response.json();
            const urlName = importUrl.split(/[?#]/)[0].split('/').pop() || 'URL_Import';
            setState(prev => ({ ...prev, id: data.task_id, status: 'downloading', originalName: urlName }));
            startPolling(data.task_id);
            setImportUrl('');
        } catch (err: any) {
            setState(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const startPolling = (taskId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
            try {
                const response = await fetch(`http://localhost:8100/task/${taskId}?t=${Date.now()}`);
                if (!response.ok) throw new Error('Task not found');
                const data = await response.json();

                if (data.status === 'cancelled') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setState(prev => ({ ...prev, status: 'cancelled' }));
                    setTimeout(() => {
                        setState(prev => ({ ...prev, status: 'idle', id: null, progress: 0, result: null }));
                    }, 1000);
                    return;
                }

                setState(prev => ({
                    ...prev,
                    status: data.status,
                    progress: data.status === 'completed' ? 100 : data.progress,
                    error: data.error || null,
                    result: data.status === 'completed' ? data.result : prev.result
                }));

                if (data.status === 'completed' || data.status === 'failed') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                }
            } catch (err: any) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setState(prev => ({ ...prev, status: 'failed', error: err.message }));
            }
        }, 1000);
    };

    const handleNewVocalsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setVoiceChange(prev => ({ ...prev, newVocalsFile: e.target.files![0] }));
        }
    };

    const handleConvertAndMerge = async () => {
        if (!state.result?.instrumental_url || !state.result?.vocals_url || !voiceChange.newVocalsFile) return;
        setVoiceChange(prev => ({ ...prev, status: 'converting', progress: 0, error: null }));
        try {
            const formData = new FormData();
            formData.append('instrumental_url', state.result.instrumental_url);
            formData.append('vocals_url', state.result.vocals_url);
            // Use the original_path from separation result (returned by backend)
            const originalPath = (state.result as any)?.original_path;
            if (originalPath) {
                formData.append('original_url', originalPath);
            }
            formData.append('reference_audio', voiceChange.newVocalsFile);
            formData.append('diffusion_steps', voiceChange.diffusionSteps.toString());
            formData.append('pitch_shift', voiceChange.pitchShift.toString());
            formData.append('f0_condition', voiceChange.f0Condition.toString());
            formData.append('auto_f0_adjust', voiceChange.autoF0Adjust.toString());

            const res = await fetch('http://localhost:8100/voice-convert', {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Conversion failed to start');
            const data = await res.json();

            setVoiceChange(prev => ({ ...prev, taskId: data.task_id }));

            if (vcPollRef.current) clearInterval(vcPollRef.current);
            vcPollRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`http://localhost:8100/task/${data.task_id}`);
                    if (!statusRes.ok) return;
                    const statusData = await statusRes.json();
                    setVoiceChange(prev => ({ ...prev, progress: statusData.progress || 0 }));

                    if (statusData.status === 'completed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({
                            ...prev,
                            status: 'done',
                            progress: 100,
                            mergedUrl: `http://localhost:8100${statusData.result?.merged_url}`,
                            processingTime: statusData.result?.processing_time
                        }));
                    } else if (statusData.status === 'failed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({ ...prev, status: 'failed', error: statusData.error || 'Voice Conversion failed' }));
                    }
                } catch (e) { console.error('VC poll error', e); }
            }, 2000);

        } catch (err: any) {
            setVoiceChange(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const triggerUpload = () => fileInputRef.current?.click();

    const formatTime = (seconds: number, precision = 0) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        let timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        if (precision > 0) timeStr += `.${ms.toString().padStart(2, '0')}`;
        return timeStr;
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 max-w-[1200px] mx-auto overflow-y-auto custom-scrollbar">
            <div className="bg-slate-900/50 p-8 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                        <Scissors className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">MV Production Support</h2>
                        <p className="text-slate-400 text-sm">Separates vocals and instruments, with precise trimming and multi-track preview.</p>
                    </div>
                </div>

                {state.status === 'idle' && (
                    <div className="space-y-6">
                        <div className="group border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/50 rounded-3xl p-12 text-center cursor-pointer transition-all hover:bg-slate-900/50" onClick={triggerUpload}>
                            <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Upload className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-200 mb-1">Upload Audio File</h3>
                            <p className="text-slate-500 text-xs max-w-sm mx-auto">MP3, WAV, or AAC. GPU Acceleration Enabled.</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="audio/*" className="hidden" />
                        </div>

                        <div className="relative flex items-center gap-4">
                            <div className="flex-1 h-px bg-slate-800"></div>
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">OR</span>
                            <div className="flex-1 h-px bg-slate-800"></div>
                        </div>

                        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                                Import from URL (YouTube, TikTok, Suno, etc.)
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                        <Link className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <input
                                        type="text"
                                        value={importUrl}
                                        onChange={(e) => setImportUrl(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
                                        placeholder="Paste URL here..."
                                        className="w-full bg-slate-900/80 text-white pl-11 pr-4 py-3 rounded-xl border border-slate-800 focus:border-indigo-500/50 focus:outline-none placeholder-slate-600 text-sm transition-all"
                                    />
                                </div>
                                <button
                                    onClick={handleUrlImport}
                                    disabled={!importUrl.trim()}
                                    className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${!importUrl.trim() ? 'bg-slate-900 text-slate-600' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                                >
                                    <Download className="w-4 h-4" />
                                    Import
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 pl-1">
                                Supported: YouTube Videos & Shorts, TikTok, Suno.ai, SoundCloud, and direct audio links.
                            </p>
                        </div>
                    </div>
                )}

                {(state.status === 'uploading' || state.status === 'downloading' || state.status === 'queued' || state.status === 'processing' || state.status === 'cancelled') && (
                    <div className="bg-slate-950/80 rounded-3xl p-12 border border-white/5 text-center space-y-8 animate-in fade-in duration-500 relative">
                        {state.status !== 'cancelled' && (
                            <button
                                onClick={handleCancel}
                                disabled={isCancelling}
                                className="absolute top-6 right-6 p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                                title="Cancel Processing"
                            >
                                <Square className="w-5 h-5 fill-current" />
                            </button>
                        )}

                        <div className="relative w-32 h-32 mx-auto">
                            <div className="absolute inset-0 border-8 border-slate-800 rounded-full"></div>
                            <svg className="absolute inset-0 transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
                                <circle className="text-indigo-500" strokeWidth="8" strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - state.progress / 100)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-3xl font-bold text-white mb-1">{Math.round(state.progress)}%</span>
                                <span className="text-xs text-indigo-400 font-medium uppercase tracking-wider">{state.status.toUpperCase()}</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white">
                                {state.status === 'uploading' ? 'Uploading File...' :
                                    state.status === 'downloading' ? 'Downloading from URL...' :
                                        state.status === 'queued' ? 'Queued for processing...' :
                                            state.status === 'cancelled' ? 'Cancelling...' : 'Separating Audio...'}
                            </h3>
                            <p className="text-slate-400 text-sm">
                                {state.status === 'cancelled' ? 'Cleaning up...' : 'Separating Vocals and Instrumentals...'}
                            </p>
                        </div>
                    </div>
                )}

                {state.status === 'completed' && state.result && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-4 py-1.5 rounded-full border border-green-400/20 text-sm font-bold">
                                <CheckCircle2 className="w-4 h-4" />
                                Separation Complete
                            </div>
                            <button onClick={() => setState({ ...state, status: 'idle' })} className="text-slate-400 hover:text-white text-sm font-medium hover:underline">Process Another File</button>
                        </div>

                        <div className="flex justify-center bg-slate-950/50 p-1 rounded-2xl border border-slate-800 w-fit mx-auto">
                            {[
                                { id: 'original', label: 'Original', icon: Music, color: 'text-emerald-400' },
                                { id: 'vocals', label: 'Vocals', icon: Mic2, color: 'text-indigo-400' },
                                { id: 'instrumental', label: 'Instrumental', icon: MicOff, color: 'text-violet-400' },
                            ].map((track) => (
                                <button
                                    key={track.id}
                                    onClick={() => setActiveTrack(track.id as TrackType)}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTrack === track.id ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'}`}
                                >
                                    <track.icon className={`w-4 h-4 ${activeTrack === track.id ? track.color : 'text-slate-500'}`} />
                                    {track.label}
                                </button>
                            ))}
                        </div>

                        <div className="bg-slate-950/80 rounded-3xl p-6 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <h3 className="text-slate-400 text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                                        <Layers className="w-4 h-4" /> Waveform Editor
                                    </h3>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handlePlayPause}
                                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${isPlaying ? 'bg-slate-800 text-red-400 hover:bg-slate-700' : 'bg-white text-slate-950 hover:bg-slate-200'}`}
                                        >
                                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                                        </button>

                                        <button
                                            onClick={toggleLoop}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold ${isLooping ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                                            title="Toggle Global Loop"
                                        >
                                            <Repeat className="w-3.5 h-3.5" />
                                            Loop
                                        </button>

                                        <div className="font-mono text-slate-300 text-xs bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                            {formatTime(currentTime)} <span className="text-slate-600">/</span> {formatTime(duration)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                                        <Volume2 className="w-4 h-4 text-slate-400" />
                                        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-20 accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => handleZoom(-1)} className="p-2 bg-slate-900 rounded-lg hover:bg-slate-800 text-slate-400"><ZoomOut className="w-4 h-4" /></button>
                                        <button onClick={() => handleZoom(1)} className="p-2 bg-slate-900 rounded-lg hover:bg-slate-800 text-slate-400"><ZoomIn className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>

                            {wavesurferError && (
                                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-xs font-mono break-all animate-in fade-in">
                                    <AlertCircle className="w-4 h-4 inline mr-2" /> {wavesurferError}
                                </div>
                            )}

                            {/* Waveform and Timeline */}
                            <div className="space-y-1">
                                <div id="waveform" ref={waveformRef} className="w-full relative rounded-xl overflow-hidden bg-slate-900/30 border border-slate-800/50 min-h-[128px]" />
                                <div id="timeline" ref={timelineRef} className="w-full border-t border-slate-800/50" />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/50 mt-2">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                                        <button onClick={handleSetStartToCurrent} className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white text-xs rounded-md transition-colors flex items-center gap-1" title="Set Start">
                                            <span className="font-bold">Set Start</span>
                                        </button>
                                        <div className="w-px h-4 bg-slate-800"></div>
                                        <button onClick={handleSetEndToCurrent} className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 hover:text-white text-xs rounded-md transition-colors flex items-center gap-1" title="Set End">
                                            <span className="font-bold">Set End</span>
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 font-mono shadow-sm">
                                        <input
                                            type="text"
                                            value={startTimeInput}
                                            onChange={(e) => setStartTimeInput(e.target.value)}
                                            onBlur={handleManualRegionUpdate}
                                            onKeyDown={(e) => e.key === 'Enter' && handleManualRegionUpdate()}
                                            className="w-20 bg-transparent text-white text-base font-bold text-center focus:outline-none border-b border-transparent focus:border-indigo-500 transition-all placeholder-slate-700"
                                            placeholder="--:--"
                                        />
                                        <span className="text-slate-600">-</span>
                                        <input
                                            type="text"
                                            value={endTimeInput}
                                            onChange={(e) => setEndTimeInput(e.target.value)}
                                            onBlur={handleManualRegionUpdate}
                                            onKeyDown={(e) => e.key === 'Enter' && handleManualRegionUpdate()}
                                            className="w-20 bg-transparent text-white text-base font-bold text-center focus:outline-none border-b border-transparent focus:border-indigo-500 transition-all placeholder-slate-700"
                                            placeholder="--:--"
                                        />
                                    </div>

                                    <button
                                        onClick={handlePlayLoop}
                                        disabled={!selectedRegion}
                                        className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl transition-all ${selectedRegion ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 ring-1 ring-inset ring-indigo-500/20' : 'text-slate-600 cursor-not-allowed'}`}
                                        title="Play Loop"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <Repeat className="w-3.5 h-3.5" />
                                        Play Loop
                                    </button>
                                </div>

                                <button
                                    onClick={handleDownloadSegment}
                                    disabled={!selectedRegion || isDownloading}
                                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all shadow-lg ${selectedRegion && !isDownloading ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                >
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Download Segment
                                </button>
                            </div>
                        </div>

                        {/* Audio Analysis Panel */}
                        <div className="bg-slate-950/80 rounded-3xl p-6 border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-slate-400 text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                                    <Scissors className="w-4 h-4" /> Audio Analysis
                                </h3>
                                <button
                                    onClick={analyzeCurrentTrack}
                                    disabled={isAnalyzing}
                                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${isAnalyzing ? 'bg-slate-800 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                >
                                    {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music className="w-3.5 h-3.5" />}
                                    {isAnalyzing ? 'Analyzing...' : 'Analyze Track'}
                                </button>
                            </div>

                            {audioAnalysis && audioAnalysis.success && (
                                <>
                                    {/* BPM / Key Display */}
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
                                            <span className="text-slate-500 text-xs">BPM:</span>
                                            <span className="text-white font-bold text-lg">{audioAnalysis.bpm || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
                                            <span className="text-slate-500 text-xs">Key:</span>
                                            <span className="text-white font-bold text-lg">{audioAnalysis.key || '-'}</span>
                                        </div>
                                    </div>

                                    {/* Peak Segments */}
                                    {audioAnalysis.segments && audioAnalysis.segments.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-slate-500 text-xs font-mono uppercase">
                                                🔥 Peak Segments (Click to Select)
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {audioAnalysis.segments.map((seg, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => handleSegmentClick(seg)}
                                                        className="flex items-center justify-between p-3 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-all group"
                                                    >
                                                        <div className="flex flex-col items-start">
                                                            <span className="text-white font-bold text-sm">{seg.label}</span>
                                                            <span className="text-slate-500 text-xs font-mono">
                                                                {formatTime(seg.start, 1)} - {formatTime(seg.end, 1)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden"
                                                                title={`Intensity: ${Math.round(seg.intensity * 100)}%`}
                                                            >
                                                                <div
                                                                    className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all"
                                                                    style={{ width: `${seg.intensity * 100}%` }}
                                                                />
                                                            </div>
                                                            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {audioAnalysis && !audioAnalysis.success && (
                                <div className="text-red-400 text-sm">
                                    Analysis failed: {audioAnalysis.error}
                                </div>
                            )}
                        </div>

                        {/* Voice Change Suite (Seed-VC) */}
                        <div className="bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-slate-900/40 rounded-3xl p-6 border border-indigo-500/30 space-y-4 shadow-xl">
                            <div className="flex items-center justify-between">
                                <h3 className="text-amber-400 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Mic2 className="w-4 h-4" /> Voice Change Suite (Seed-VC)
                                </h3>
                                <div className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] text-amber-500 font-bold uppercase tracking-widest">
                                    Premium AI
                                </div>
                            </div>

                            {voiceChange.status === 'idle' || voiceChange.status === 'failed' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-1">
                                                <Upload className="w-3 h-3" /> Step 1: Upload Target Voice
                                            </label>
                                            <div className={`relative w-full h-24 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${voiceChange.newVocalsFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 hover:border-slate-600 bg-slate-950/30'}`}>
                                                <input
                                                    type="file"
                                                    accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
                                                    onChange={handleNewVocalsUpload}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                                {voiceChange.newVocalsFile ? (
                                                    <div className="flex flex-col items-center gap-1 px-4">
                                                        <CheckCircle2 className="w-6 h-6 text-amber-500 mb-1" />
                                                        <span className="text-xs font-bold text-amber-300 text-center truncate max-w-full">
                                                            {voiceChange.newVocalsFile.name}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500 uppercase font-black tracking-tighter">Ready to convert</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 px-4">
                                                        <div className="p-2 bg-slate-900 rounded-lg">
                                                            <Upload className="w-4 h-4 text-slate-500" />
                                                        </div>
                                                        <div className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-tight">
                                                            Drop a voice sample (10-30s)<br />
                                                            <span className="text-slate-700">.wav, .mp3, .m4a</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col justify-end space-y-3 pb-1">
                                            <div className="bg-slate-900/40 rounded-2xl p-4 border border-white/5 space-y-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">SVC Pro Tuning / 詳細設定</span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                                            <span>Diffusion Steps</span>
                                                            <span className="text-indigo-400">{voiceChange.diffusionSteps}</span>
                                                        </div>
                                                        <input
                                                            type="range" min="4" max="100" step="1"
                                                            value={voiceChange.diffusionSteps}
                                                            onChange={(e) => setVoiceChange(p => ({ ...p, diffusionSteps: parseInt(e.target.value) }))}
                                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                        />
                                                        <p className="text-[7px] text-slate-600 italic">Density/Quality. higher=better. / 変換密度。高いほど高品質になります。</p>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                                            <span>Pitch Shift</span>
                                                            <span className={voiceChange.pitchShift === 0 ? "text-slate-500" : "text-amber-400"}>
                                                                {voiceChange.pitchShift > 0 ? `+${voiceChange.pitchShift}` : voiceChange.pitchShift}
                                                            </span>
                                                        </div>
                                                        <input
                                                            type="range" min="-12" max="12" step="1"
                                                            value={voiceChange.pitchShift}
                                                            onChange={(e) => setVoiceChange(p => ({ ...p, pitchShift: parseInt(e.target.value) }))}
                                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                        />
                                                        <p className="text-[7px] text-slate-600 italic">Adjust vocal pitch. / 声の高さを半音単位で調整します。</p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-4 pt-1">
                                                    <div className="space-y-0.5">
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <div
                                                                onClick={() => setVoiceChange(p => ({ ...p, f0Condition: !p.f0Condition }))}
                                                                className={`w-7 h-3.5 rounded-full transition-colors relative ${voiceChange.f0Condition ? 'bg-indigo-600' : 'bg-slate-800'}`}
                                                            >
                                                                <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${voiceChange.f0Condition ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                                            </div>
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-300">F0 Condition</span>
                                                        </label>
                                                        <p className="text-[7px] text-slate-700 pl-9 italic">Pitch tracking. / ピッチ追従改善。</p>
                                                    </div>

                                                    <div className="space-y-0.5">
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <div
                                                                onClick={() => setVoiceChange(p => ({ ...p, autoF0Adjust: !p.autoF0Adjust }))}
                                                                className={`w-7 h-3.5 rounded-full transition-colors relative ${voiceChange.autoF0Adjust ? 'bg-amber-600' : 'bg-slate-800'}`}
                                                            >
                                                                <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${voiceChange.autoF0Adjust ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                                            </div>
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-300">Auto Pitch</span>
                                                        </label>
                                                        <p className="text-[7px] text-slate-700 pl-9 italic">Auto pitch correction. / 自動ピッチ補正。</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleConvertAndMerge}
                                                disabled={!voiceChange.newVocalsFile}
                                                className={`w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg ${!voiceChange.newVocalsFile
                                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98]'
                                                    }`}
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                                Convert & Create / 声質変換を実行
                                            </button>
                                        </div>
                                    </div>
                                    {voiceChange.error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-bold flex items-start gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            {voiceChange.error}
                                        </div>
                                    )}
                                </div>
                            ) : voiceChange.status === 'converting' ? (
                                <div className="py-6 space-y-4">
                                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.15em] text-amber-300">
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                            AI Voice Morphing & Merging...
                                        </div>
                                        <span className="bg-amber-500/20 px-2 py-0.5 rounded tabular-nums">
                                            {Math.round(voiceChange.progress)}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden shadow-inner ring-1 ring-white/5">
                                        <div
                                            className="h-full transition-all duration-700 ease-out bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 relative"
                                            style={{ width: `${voiceChange.progress}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                        <span>Initializing Models / モデル準備中</span>
                                        <span>Estimated: 1-2 min (GPU)</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-2 space-y-4 animate-in zoom-in-95 duration-500">
                                    <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                                                <CheckCircle2 className="w-5 h-5 text-green-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-white text-sm font-bold flex items-center gap-2">
                                                    {voiceChange.processingTime && (
                                                        <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded ml-2">
                                                            ⏱️ {Math.floor(voiceChange.processingTime / 60)}m {Math.floor(voiceChange.processingTime % 60)}s
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-[10px] text-green-400/70 font-medium uppercase tracking-wider">Vocals morphed with Seed-VC</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setVoiceChange({ ...voiceChange, status: 'idle', mergedUrl: null })}
                                            className="text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest"
                                        >
                                            Discard / 戻る
                                        </button>
                                    </div>

                                    {voiceChange.mergedUrl && (
                                        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Merged Result Preview</span>
                                                <a
                                                    href={voiceChange.mergedUrl}
                                                    onClick={(e) => {
                                                        const orig = state.originalName?.replace(/\.[^/.]+$/, "") || "Original";
                                                        const singer = voiceChange.newVocalsFile?.name?.replace(/\.[^/.]+$/, "") || "Cover";
                                                        const safeName = `[${singer}]_${orig}.wav`.replace(/[\/\\?%*:|"<>]/g, '-');
                                                        if (voiceChange.mergedUrl) handleDownloadFile(e, voiceChange.mergedUrl, safeName);
                                                    }}
                                                    download="vc_merged_result.wav"
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-white hover:text-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${isDownloading ? 'opacity-50 pointer-events-none' : ''}`}
                                                >
                                                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                    {isDownloading ? 'Downloading...' : 'Download Result'}
                                                </a>
                                            </div>
                                            <audio controls src={voiceChange.mergedUrl} className="w-full h-10 accent-indigo-500" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <a
                                href={state.result?.vocals_url ? `http://localhost:8100${state.result.vocals_url}` : '#'}
                                onClick={(e) => state.result?.vocals_url && handleDownloadFile(e, `http://localhost:8100${state.result.vocals_url}`, 'vocals.wav')}
                                className={`flex items-center justify-between p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all text-indigo-300 group cursor-pointer ${isDownloading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <span className="flex items-center gap-2 font-bold text-sm">
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic2 className="w-4 h-4" />} Download Vocals
                                </span>
                                <Download className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </a>
                            <a
                                href={state.result?.instrumental_url ? `http://localhost:8100${state.result.instrumental_url}` : '#'}
                                onClick={(e) => state.result?.instrumental_url && handleDownloadFile(e, `http://localhost:8100${state.result.instrumental_url}`, 'instrumental.wav')}
                                className={`flex items-center justify-between p-4 bg-violet-500/5 border border-violet-500/10 rounded-2xl hover:bg-violet-500/10 hover:border-violet-500/30 transition-all text-violet-300 group cursor-pointer ${isDownloading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <span className="flex items-center gap-2 font-bold text-sm">
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicOff className="w-4 h-4" />} Download Instrumental
                                </span>
                                <Download className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </a>
                        </div>
                    </div>
                )
                }

                {
                    state.status === 'failed' && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center space-y-4">
                            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-red-400">Separation Failed</h3>
                                <p className="text-red-300/80 text-sm">{state.error}</p>
                            </div>
                            <button onClick={() => setState({ ...state, status: 'idle' })} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all">Try Again</button>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default MvProductionTab;

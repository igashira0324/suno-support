import { useState, useRef, useEffect, useCallback } from 'react';
import { TaskState, VoiceChangeState, TrackType, AudioAnalysis, CLAPResult, CLAPPreset } from '../types';
import { mvApi } from '../api/mvApi';
import { toApiUrl } from '../../../api/client';

export const useMvProduction = () => {
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

    const [activeTrack, setActiveTrack] = useState<TrackType>('original');
    const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [clapResults, setClapResults] = useState<CLAPResult[]>([]);
    const [clapPresets, setClapPresets] = useState<CLAPPreset[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vcPollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (vcPollRef.current) clearInterval(vcPollRef.current);
        };
    }, []);

    const startPolling = useCallback((taskId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
            try {
                const data = await mvApi.getTaskStatus(taskId);
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
    }, []);

    const handleFileSelect = async (file: File) => {
        setState({ id: null, status: 'uploading', progress: 0, error: null, result: null });
        setActiveTrack('original');

        try {
            const data = await mvApi.separate(file);
            setState(prev => ({ ...prev, id: data.task_id, status: 'queued', originalName: file.name }));
            startPolling(data.task_id);
        } catch (err: any) {
            setState(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const handleUrlImport = async (url: string) => {
        setState({ id: null, status: 'downloading', progress: 0, error: null, result: null });
        setActiveTrack('original');

        try {
            const data = await mvApi.separateUrl(url);
            const urlName = url.split(/[?#]/)[0].split('/').pop() || 'URL_Import';
            setState(prev => ({ ...prev, id: data.task_id, status: 'downloading', originalName: urlName }));
            startPolling(data.task_id);
        } catch (err: any) {
            setState(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const handleCancel = async () => {
        if (!state.id || isCancelling) return;
        setIsCancelling(true);
        try {
            await mvApi.cancelTask(state.id);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setState(prev => ({ ...prev, status: 'cancelled', progress: 0 }));
            setTimeout(() => {
                setState(prev => ({ ...prev, status: 'idle', id: null, progress: 0, result: null }));
                setIsCancelling(false);
            }, 1000);
        } catch (e) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setState(prev => ({ ...prev, status: 'idle', id: null, progress: 0, result: null }));
            setIsCancelling(false);
        }
    };

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
            const data = await mvApi.analyzeAudio(trackUrl);
            setAudioAnalysis(data);
        } catch (e) {
            setAudioAnalysis(null);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleClapSearch = async (query: string) => {
        if (!state.result || !query.trim()) return;
        const trackUrl = activeTrack === 'original'
            ? state.result.original_path
            : activeTrack === 'vocals'
                ? state.result.vocals_url
                : state.result.instrumental_url;

        if (!trackUrl) return;
        setIsSearching(true);
        setClapResults([]);
        try {
            const data = await mvApi.clapSearch(trackUrl, query);
            if (data.success && data.results) {
                setClapResults(data.results);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const presetsLoadedRef = useRef(false);
    const loadClapPresets = useCallback(async () => {
        if (presetsLoadedRef.current) return;
        try {
            presetsLoadedRef.current = true;
            const data = await mvApi.getClapPresets();
            setClapPresets(data.presets || []);
        } catch (e) {
            presetsLoadedRef.current = false;
            console.error(e);
        }
    }, []);


    const handleConvertAndMerge = async () => {
        if (!state.result?.instrumental_url || !state.result?.vocals_url || !voiceChange.newVocalsFile) return;
        setVoiceChange(prev => ({ ...prev, status: 'converting', progress: 0, error: null }));
        try {
            const data = await mvApi.voiceConvert({
                instrumental_url: state.result.instrumental_wav_url || state.result.instrumental_url,
                vocals_url: state.result.vocals_wav_url || state.result.vocals_url,
                original_url: (state.result as any)?.original_path,
                reference_audio: voiceChange.newVocalsFile,
                diffusion_steps: voiceChange.diffusionSteps,
                pitch_shift: voiceChange.pitchShift,
                f0_condition: voiceChange.f0Condition,
                auto_f0_adjust: voiceChange.autoF0Adjust
            });

            setVoiceChange(prev => ({ ...prev, taskId: data.task_id }));

            if (vcPollRef.current) clearInterval(vcPollRef.current);
            vcPollRef.current = setInterval(async () => {
                try {
                    const statusData = await mvApi.getTaskStatus(data.task_id);
                    setVoiceChange(prev => ({ ...prev, progress: statusData.progress || 0 }));

                    if (statusData.status === 'completed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({
                            ...prev,
                            status: 'done',
                            progress: 100,
                            mergedUrl: toApiUrl(statusData.result?.merged_url),
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

    return {
        state,
        voiceChange,
        setVoiceChange,
        activeTrack,
        setActiveTrack,
        audioAnalysis,
        isAnalyzing,
        clapResults,
        clapPresets,
        isSearching,
        isCancelling,
        handleFileSelect,
        handleUrlImport,
        handleCancel,
        analyzeCurrentTrack,
        handleClapSearch,
        loadClapPresets,
        handleConvertAndMerge
    };
};

import { useState, useRef, useEffect, useCallback } from 'react';
import { AceStepState, VoiceChangeState, AceStepTaskType } from '../types';
import { GenerationMode } from '../../../types';
import { aceStepApi as acestepApi } from '../api/aceStepApi';
import { toApiUrl } from '../../../api/client';
import { generateSunoPrompt, generateTitle, structureLyrics, generateStyleFromLyrics } from '../../../services/geminiService';

export const useAceStep = () => {
    const [state, setState] = useState<AceStepState>({
        prompt: "A high-energy J-pop song with emotional piano and fast drums.",
        lyrics: "[Verse 1]\n空を見上げて 手をのばした\n届かない距離さえ 抱きしめて\n\n[Chorus]\n明日へ続く この道を行こう\n二度とない瞬間を 今きらめかせて",
        thinking: true,
        inference_steps: 32,
        batch_size: 1,
        duration: -1,
        language: "ja",
        model: "acestep-v15-base",
        sample_mode: false,
        sample_query: "",
        isGenerating: false,
        taskId: null,
        status: "idle",
        progress: 0,
        output_files: [],
        error: null,
        imageFile: null,
        isAnalyzing: false,
        theme: "",
        seed: -1,
        task_type: "text2music",
        coverAudioSourceType: 'upload',
        coverAudioUrl: '',
        coverAudioFile: null,
        audio_cover_strength: 0.8,
        coverLyricsMode: 'custom',
        isExtractingLyrics: false,
        useAdg: false,
        referenceAudioSourceType: 'upload',
        referenceAudioUrl: '',
        referenceAudioFile: null,
        isDownloadingSource: false,
        repainting_start: 0,
        repainting_end: -1,
        autoTrim: true,
        fadeDuration: 3,
        useRandomSeed: true,
        legoTrackName: 'vocals',
        shift: 1.0,
        guidance_scale: 7.0,
        infer_method: 'ode',
        stylePreset: 'none',
        startTime: undefined,
        processingTime: undefined
    });

    const [visualProgress, setVisualProgress] = useState(0);
    const [voiceChange, setVoiceChange] = useState<VoiceChangeState>({
        activeIndex: null,
        status: 'idle',
        taskId: null,
        progress: 0,
        instrumentalUrl: null,
        vocalsUrl: null,
        originalUrl: null,
        newVocalsFile: null,
        mergedUrl: null,
        error: null,
        diffusionSteps: 50,
        pitchShift: 0,
        f0Condition: true,
        autoF0Adjust: false
    });

    const [isDownloading, setIsDownloading] = useState(false);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vcPollRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (vcPollRef.current) clearInterval(vcPollRef.current);
        };
    }, []);

    // Smooth progress simulation
    useEffect(() => {
        if (['running', 'queued', 'starting', 'processing'].includes(state.status)) {
            const interval = setInterval(() => {
                setVisualProgress(prevProgress => {
                    const target = state.progress;
                    if (target > prevProgress && target <= 100) return target;
                    if (prevProgress < 98) return prevProgress + 0.083;
                    return prevProgress;
                });
            }, 500);
            return () => clearInterval(interval);
        } else if (state.status === 'completed') {
            setVisualProgress(100);
        } else if (state.status === 'idle') {
            setVisualProgress(0);
        }
    }, [state.status, state.progress]);

    const startPolling = useCallback((taskId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const data = await acestepApi.getStatus(taskId);
                const currentStatus = data.status;
                const progress = data.progress || 0;

                setState(prev => ({
                    ...prev,
                    status: currentStatus,
                    progress: progress,
                    output_files: (data.output_files || []).map((file: any) => ({
                        ...file,
                        url: toApiUrl(file.url)
                    })),
                    error: currentStatus === "failed" ? (data.error || "Generation failed") : null
                }));

                if (currentStatus === 'completed' || currentStatus === 'failed') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    
                    setState(prev => {
                        const endTime = Date.now();
                        const pTime = prev.startTime ? (endTime - prev.startTime) / 1000 : undefined;
                        
                        return {
                            ...prev,
                            isGenerating: false,
                            processingTime: pTime
                        };
                    });

                    // Auto Post-Process for Repaint
                    if (currentStatus === 'completed' && state.task_type === 'repaint' && state.autoTrim && data.output_files?.length > 0) {
                        const firstFileUrl = data.output_files[0].url;
                        acestepApi.postProcess({
                            file_url: firstFileUrl,
                            fade_duration: state.fadeDuration,
                            auto_trim: state.autoTrim
                        }).then(postData => {
                            if (postData.url) {
                                setState(prev => ({
                                    ...prev,
                                    output_files: [{
                                        ...data.output_files[0],
                                        url: toApiUrl(postData.url),
                                        label: `Processed (Trimmed & Faded)`
                                    }, ...prev.output_files]
                                }));
                            }
                        }).catch(e => console.error("PostProcess error", e));
                    }
                }
            } catch (err: any) {
                console.error("Polling error:", err);
            }
        }, 2000);
    }, [state.task_type, state.autoTrim, state.fadeDuration]);

    const handleGenerate = async () => {
        setState(prev => ({ ...prev, isGenerating: true, status: 'starting', progress: 0, error: null, output_files: [], startTime: Date.now() }));
        setVisualProgress(0);

        try {
            // Background Title Gen
            generateTitle(state.lyrics, state.theme, state.prompt)
                .then(title => setState(prev => ({ ...prev, generatedTitle: title })))
                .catch(e => console.error("Title gen failed", e));

            let srcAudioPath: string | null = null;
            if (['cover', 'repaint', 'lego'].includes(state.task_type)) {
                if (state.coverAudioSourceType === 'upload' && state.coverAudioFile) {
                    const uploadData = await acestepApi.uploadSource(state.coverAudioFile);
                    srcAudioPath = uploadData.path;
                } else if (state.coverAudioSourceType === 'url' && state.coverAudioUrl) {
                    setState(prev => ({ ...prev, isDownloadingSource: true }));
                    try {
                        const downloadData = await acestepApi.downloadUrl(state.coverAudioUrl);
                        srcAudioPath = downloadData.path;
                    } finally {
                        setState(prev => ({ ...prev, isDownloadingSource: false }));
                    }
                }
            }

            // Apply style presets to prompt if selected
            let finalPrompt = state.prompt;
            if (state.stylePreset === 'suno') {
                finalPrompt = `[Suno v4 Style] ${finalPrompt}`;
            } else if (state.stylePreset === 'realistic') {
                finalPrompt = `[High Fidelity, Studio Quality] ${finalPrompt}`;
            } else if (state.stylePreset === 'vintage') {
                finalPrompt = `[Lo-Fi, Analog Warmth, 90s Aesthetic] ${finalPrompt}`;
            }

            const data = await acestepApi.generate({
                ...state,
                prompt: finalPrompt,
                src_audio_path: srcAudioPath,
                reference_audio_path: (state.useAdg && srcAudioPath) ? srcAudioPath : null
            });
            
            if (data.task_id) {
                setState(prev => ({ ...prev, taskId: data.task_id }));
                startPolling(data.task_id);
            }
        } catch (err: any) {
            setState(prev => ({ ...prev, isGenerating: false, status: 'failed', error: err.message }));
        }
    };

    const handleStartVoiceChange = async (audioUrl: string, idx: number, title?: string) => {
        let originalWebPath: string | null = null;
        try {
            const urlObj = new URL(audioUrl);
            originalWebPath = urlObj.searchParams.get('path') || urlObj.pathname;
        } catch {
            originalWebPath = audioUrl;
        }

        setVoiceChange(prev => ({ 
            ...prev, 
            activeIndex: idx, 
            status: 'separating', 
            taskId: null, 
            progress: 0, 
            instrumentalUrl: null, 
            vocalsUrl: null, 
            originalUrl: originalWebPath, 
            newVocalsFile: null, 
            mergedUrl: null, 
            error: null, 
            songTitle: title 
        }));

        try {
            const data = await acestepApi.separate(originalWebPath!);
            setVoiceChange(prev => ({ ...prev, taskId: data.task_id }));

            if (vcPollRef.current) clearInterval(vcPollRef.current);
            vcPollRef.current = setInterval(async () => {
                try {
                    const statusData = await acestepApi.getTaskStatus(data.task_id);
                    setVoiceChange(prev => ({ ...prev, progress: statusData.progress || 0 }));
                    if (statusData.status === 'completed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({
                            ...prev,
                            status: 'ready',
                            progress: 100,
                            instrumentalUrl: toApiUrl(statusData.result?.vocals_url?.replace('vocals.wav', 'instrumental.wav')), // Fallback if backend doesn't provide full URL
                            vocalsUrl: toApiUrl(statusData.result?.vocals_url)
                        }));
                        // Fix for instrumental URL if not explicitly returned
                        if (statusData.result?.instrumental_url) {
                            setVoiceChange(prev => ({ ...prev, instrumentalUrl: toApiUrl(statusData.result.instrumental_url) }));
                        }
                    } else if (statusData.status === 'failed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({ ...prev, status: 'failed', error: statusData.error || 'Separation failed' }));
                    }
                } catch (e) { console.error('VC poll error', e); }
            }, 2000);
        } catch (err: any) {
            setVoiceChange(prev => ({ ...prev, status: 'failed', error: err.message }));
        }
    };

    const handleConvertAndMerge = async () => {
        if (!voiceChange.instrumentalUrl || !voiceChange.vocalsUrl || !voiceChange.newVocalsFile) return;
        setVoiceChange(prev => ({ ...prev, status: 'converting', progress: 0, error: null }));
        try {
            const formData = new FormData();
            formData.append('instrumental_url', voiceChange.instrumentalUrl);
            formData.append('vocals_url', voiceChange.vocalsUrl);
            if (voiceChange.originalUrl) formData.append('original_url', voiceChange.originalUrl);
            formData.append('reference_audio', voiceChange.newVocalsFile);
            formData.append('diffusion_steps', voiceChange.diffusionSteps.toString());
            formData.append('pitch_shift', voiceChange.pitchShift.toString());
            formData.append('f0_condition', voiceChange.f0Condition.toString());
            formData.append('auto_f0_adjust', voiceChange.autoF0Adjust.toString());

            const data = await acestepApi.voiceConvert(formData);
            setVoiceChange(prev => ({ ...prev, taskId: data.task_id }));

            if (vcPollRef.current) clearInterval(vcPollRef.current);
            vcPollRef.current = setInterval(async () => {
                try {
                    const statusData = await acestepApi.getTaskStatus(data.task_id);
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

    const handleExtractLyrics = async () => {
        const url = state.coverAudioUrl;
        if (!url) {
            setState(prev => ({ ...prev, error: 'Please enter a URL first.' }));
            return;
        }
        setState(prev => ({ ...prev, isExtractingLyrics: true, error: null }));
        try {
            const data = await acestepApi.extractLyrics({ url, language: state.language });
            if (data.lyrics) {
                let currentPrompt = data.prompt || state.prompt;
                if (data.method?.startsWith('suno_')) {
                    setState(prev => ({ ...prev, lyrics: data.lyrics, prompt: currentPrompt, isExtractingLyrics: false }));
                    return;
                }
                const structured = await structureLyrics(data.lyrics, currentPrompt, state.theme, state.language);
                setState(prev => ({ ...prev, lyrics: structured, prompt: currentPrompt, isExtractingLyrics: false }));
            }
        } catch (err: any) {
            setState(prev => ({ ...prev, isExtractingLyrics: false, error: err.message }));
        }
    };

    const handleDownloadFile = async (url: string, filename: string) => {
        if (!url || isDownloading) return;
        setIsDownloading(true);
        try {
            const response = await fetch(url);
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
            alert("Download failed: " + error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleAnalyzeImage = async () => {
        if (!state.imageFile) return;
        setState(prev => ({ ...prev, isAnalyzing: true, error: null }));
        try {
            const result = await generateSunoPrompt(state.prompt || "Analyze this image", "", state.imageFile, GenerationMode.AUTO, { searchEngine: 'none', modelName: 'gemini-3.1-pro' }, state.theme);
            if (result.bestSelection) {
                setState(prev => ({ ...prev, prompt: result.bestSelection!.style, lyrics: result.bestSelection!.content, isAnalyzing: false }));
            }
        } catch (err: any) {
            setState(prev => ({ ...prev, isAnalyzing: false, error: "Analysis failed: " + err.message }));
        }
    };

    return {
        state,
        setState,
        visualProgress,
        voiceChange,
        setVoiceChange,
        handleGenerate,
        handleStartVoiceChange,
        handleConvertAndMerge,
        handleExtractLyrics,
        handleDownloadFile,
        handleAnalyzeImage,
        isDownloading
    };
};

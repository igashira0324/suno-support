import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Music, AlertCircle, Loader2, FileAudio, Sparkles, Settings2, Languages, Clock, Layers, Image as ImageIcon, Upload, X, RefreshCw, Sliders, Mic, Merge, ArrowRight } from 'lucide-react';
import { AceStepState, GenerationMode } from '../types';
import { generateSunoPrompt, generateTitle, structureLyrics } from '../services/geminiService';
import WaveformPlayer from './WaveformPlayer';

const AceStepTab: React.FC = () => {
    const [state, setState] = useState<AceStepState>({
        prompt: "A high-energy J-pop song with emotional piano and fast drums.",
        lyrics: "[Verse 1]\n空を見上げて 手をのばした\n届かない距離さえ 抱きしめて\n\n[Chorus]\n明日へ続く この道を行こう\n二度とない瞬間を 今きらめかせて",
        thinking: false,
        inference_steps: 8,
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
        useRandomSeed: true
    });

    const [visualProgress, setVisualProgress] = useState(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vcPollRef = useRef<NodeJS.Timeout | null>(null);

    // Smooth progress bar simulation
    useEffect(() => {
        if (state.status === 'running' || state.status === 'queued' || state.status === 'starting' || state.status === 'processing') {
            const interval = setInterval(() => {
                setVisualProgress(prev => {
                    const target = state.progress * 100;
                    if (target > prev && target <= 100) return target; // Catch up to backend if it jumps ahead

                    // User request: "3 logs = 1%". Polling is 2s, so 3 logs = 6s.
                    // 1% per 6 seconds = 0.166% per second. 
                    // Interval is 500ms, so 0.083% per tick.
                    if (prev < 98) {
                        return prev + 0.083;
                    }
                    return prev;
                });
            }, 500);
            return () => clearInterval(interval);
        } else if (state.status === 'completed') {
            setVisualProgress(100);
        } else if (state.status === 'idle') {
            setVisualProgress(0);
        }
    }, [state.status, state.progress]);

    // New state for processed audio URL (for preview)
    const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);

    // Voice Change state
    interface VoiceChangeState {
        activeIndex: number | null;
        status: 'idle' | 'separating' | 'ready' | 'converting' | 'done' | 'failed';
        taskId: string | null;
        progress: number;
        instrumentalUrl: string | null;
        vocalsUrl: string | null;
        originalUrl: string | null;
        newVocalsFile: File | null;
        mergedUrl: string | null;
        error: string | null;
        processingTime?: number;
        // Tuning Parameters
        diffusionSteps: number;
        pitchShift: number;
        f0Condition: boolean;
        autoF0Adjust: boolean;
        songTitle?: string;
    }
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

    // Start Voice Change: separate the generated audio
    const handleStartVoiceChange = async (audioUrl: string, idx: number, title?: string) => {
        // Extract just the web path from the full URL for original_url
        let originalWebPath: string | null = null;
        try {
            const urlObj = new URL(audioUrl);
            // If ?path= query param exists, use that; otherwise use pathname
            originalWebPath = urlObj.searchParams.get('path') || urlObj.pathname;
        } catch {
            originalWebPath = audioUrl;
        }
        setVoiceChange(prev => ({ ...prev, activeIndex: idx, status: 'separating', taskId: null, progress: 0, instrumentalUrl: null, vocalsUrl: null, originalUrl: originalWebPath, newVocalsFile: null, mergedUrl: null, error: null, songTitle: title }));
        try {
            console.log("[VoiceChange] Original audioUrl:", audioUrl, "-> webPath:", originalWebPath);
            const urlObj = new URL(audioUrl);
            let filePath = urlObj.pathname;
            if (urlObj.searchParams.has('path')) {
                filePath = urlObj.searchParams.get('path')!;
            }

            const res = await fetch('http://localhost:8100/separate-generated', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_url: filePath })
            });
            if (!res.ok) throw new Error('Failed to start separation');
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
                            status: 'ready',
                            progress: 100,
                            instrumentalUrl: `http://localhost:8100${statusData.result?.instrumental_url}`,
                            vocalsUrl: `http://localhost:8100${statusData.result?.vocals_url}`
                        }));
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

    // Handle reference voice file upload
    const handleNewVocalsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setVoiceChange(prev => ({ ...prev, newVocalsFile: e.target.files![0] }));
        }
    };

    // Convert vocals to new voice and merge with instrumental
    const handleConvertAndMerge = async () => {
        if (!voiceChange.instrumentalUrl || !voiceChange.vocalsUrl || !voiceChange.newVocalsFile) return;
        setVoiceChange(prev => ({ ...prev, status: 'converting', progress: 0, error: null }));
        try {
            const formData = new FormData();
            formData.append('instrumental_url', voiceChange.instrumentalUrl);
            formData.append('vocals_url', voiceChange.vocalsUrl);
            if (voiceChange.originalUrl) {
                formData.append('original_url', voiceChange.originalUrl);
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

    // Cleanup VC poll on unmount
    useEffect(() => {
        return () => { if (vcPollRef.current) clearInterval(vcPollRef.current); };
    }, []);

    // Extract lyrics from URL (YouTube subtitles or Whisper)
    const handleExtractLyrics = async () => {
        const url = state.coverAudioUrl;
        if (!url) {
            setState(prev => ({ ...prev, error: 'Please enter a URL first to extract lyrics.' }));
            return;
        }
        setState(prev => ({ ...prev, isExtractingLyrics: true, error: null }));
        try {
            const res = await fetch('http://localhost:8100/acestep/extract-lyrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, language: state.language })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Failed to extract lyrics (${res.status})`);
            }
            const data = await res.json();
            if (data.lyrics) {
                // If it's from Suno, use it directly as requested by the user
                if (data.method && data.method.startsWith('suno_')) {
                    console.log('[LyricsExtract] Suno direct lyrics - bypassing AI structuring');
                    setState(prev => ({ ...prev, lyrics: data.lyrics, isExtractingLyrics: false }));
                    return;
                }

                // Step 2: Use Local LLM (or Gemini AI fallback) to clean up and add structure tags
                console.log('[LyricsExtract] Raw lyrics received, length:', data.lyrics.length);
                console.log('[LyricsExtract] Calling structureLyrics with prompt:', state.prompt?.substring(0, 50), 'theme:', state.theme?.substring(0, 50));
                try {
                    const structured = await structureLyrics(
                        data.lyrics,
                        state.prompt,
                        state.theme,
                        state.language
                    );
                    console.log('[LyricsExtract] Structured lyrics received, length:', structured.length);
                    console.log('[LyricsExtract] First 100 chars:', structured.substring(0, 100));
                    setState(prev => ({ ...prev, lyrics: structured, isExtractingLyrics: false }));
                } catch (aiErr) {
                    console.error('[LyricsExtract] AI structuring FAILED:', aiErr);
                    setState(prev => ({ ...prev, lyrics: data.lyrics, isExtractingLyrics: false }));
                }
            } else {
                throw new Error('No lyrics could be extracted.');
            }
        } catch (err: any) {
            setState(prev => ({ ...prev, isExtractingLyrics: false, error: err.message }));
        }
    };


    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    // Model change handler: auto-adjust inference steps
    const handleModelChange = (newModel: string) => {
        const isTurbo = newModel.includes('turbo');
        setState(prev => ({
            ...prev,
            model: newModel,
            inference_steps: isTurbo ? 8 : 32
        }));
    };

    // Task type change handler: auto-fill prompt for cover/repaint mode
    const handleTaskTypeChange = (nextType: string) => {
        setState(prev => {
            let nextPrompt = prev.prompt;

            // If switching to cover/repaint and prompt is default or empty, set to reasonable default
            if (nextType === 'cover' && (prev.prompt === "" || prev.prompt === "A high-energy J-pop song with emotional piano and fast drums.")) {
                nextPrompt = "Faithful cover, original melody, high fidelity";
            } else if (nextType === 'repaint' && (prev.prompt === "" || prev.prompt === "A high-energy J-pop song with emotional piano and fast drums.")) {
                nextPrompt = "Extend song, same style and orchestration, seamless transition";
            } else if (nextType === 'text2music' && (prev.prompt === "Faithful cover, original melody, high fidelity" || prev.prompt === "Extend song, same style and orchestration, seamless transition")) {
                nextPrompt = "A high-energy J-pop song with emotional piano and fast drums.";
            }

            return {
                ...prev,
                task_type: nextType,
                prompt: nextPrompt
            };
        });
    };

    // Cover audio file handlers
    const handleCoverAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setState(prev => ({ ...prev, coverAudioFile: e.target.files![0] }));
        }
    };

    const handleCoverAudioDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
                setState(prev => ({ ...prev, coverAudioFile: file }));
            }
        }
    };

    const clearCoverAudio = () => {
        setState(prev => ({ ...prev, coverAudioFile: null }));
    };

    // Reference (ADG) audio file handlers
    const handleReferenceAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setState(prev => ({ ...prev, referenceAudioFile: e.target.files![0] }));
        }
    };

    const handleReferenceAudioDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|ogg|m4a)$/i)) {
                setState(prev => ({ ...prev, referenceAudioFile: file }));
            }
        }
    };

    const clearReferenceAudio = () => {
        setState(prev => ({ ...prev, referenceAudioFile: null }));
    };

    const handleGenerate = async () => {
        // Start title generation in parallel if not already present
        let currentTitle = state.generatedTitle;

        // Reset state for new generation but keep title if it exists (or regenerate later)
        // If it's a new generation, we probably want a new title if the prompt changed?
        // Let's regenerate title every time to match the specific generation context
        setState(prev => ({ ...prev, isGenerating: true, error: null, progress: 0, status: "starting", output_files: [], generatedTitle: undefined }));
        setVisualProgress(0); // Reset visual progress bar

        // Fire title generation
        // We don't await here to let music generation start immediately
        generateTitle(state.lyrics, state.theme, state.prompt)
            .then(title => {
                setState(prev => ({ ...prev, generatedTitle: title }));
            })
            .catch(err => console.error("Title generation background failed:", err));

        try {
            // If Cover or Repaint mode, upload audio file OR download from URL
            let srcAudioPath: string | null = null;
            if (state.task_type === 'cover' || state.task_type === 'repaint') {
                if (state.coverAudioSourceType === 'upload' && state.coverAudioFile) {
                    const formData = new FormData();
                    formData.append('file', state.coverAudioFile);
                    const uploadRes = await fetch('http://localhost:8100/acestep/upload-source', {
                        method: 'POST',
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (!uploadData.path) throw new Error('Failed to upload source audio');
                    srcAudioPath = uploadData.path;
                    // Set preview URL for uploaded file
                    const uploadFilename = srcAudioPath!.split(/[\\/]/).pop();
                    if (uploadFilename) {
                        setProcessedAudioUrl(`http://localhost:8100/uploads/acestep_source/${uploadFilename}`);
                    }
                } else if (state.coverAudioSourceType === 'url' && state.coverAudioUrl) {
                    // Download from URL
                    setState(prev => ({ ...prev, isDownloadingSource: true }));
                    try {
                        const downloadRes = await fetch('http://localhost:8100/acestep/download-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: state.coverAudioUrl })
                        });

                        if (!downloadRes.ok) {
                            const errText = await downloadRes.text();
                            throw new Error(`Download failed: ${errText}`);
                        }

                        const downloadData = await downloadRes.json();
                        if (!downloadData.path) throw new Error('Failed to download source audio');
                        srcAudioPath = downloadData.path;
                        // Set preview URL for downloaded file
                        const downloadFilename = srcAudioPath!.split(/[\\/]/).pop();
                        if (downloadFilename) {
                            setProcessedAudioUrl(`http://localhost:8100/uploads/acestep_source/${downloadFilename}`);
                        }
                    } finally {
                        setState(prev => ({ ...prev, isDownloadingSource: false }));
                    }
                }
            }

            // Handle ADG Reference Audio if enabled
            let refAudioPath: string | null = null;
            if (state.task_type === 'cover' && state.useAdg) {
                // User wants to use the SAME source audio as the style reference
                refAudioPath = srcAudioPath;
                if (!refAudioPath) {
                    throw new Error('Please provide a source audio for Arrange mode to use ADG.');
                }
            }

            const requestBody = {
                prompt: state.prompt,
                lyrics: state.lyrics,
                thinking: state.thinking,
                inference_steps: state.inference_steps,
                batch_size: state.batch_size,
                duration: state.duration,
                language: state.language,
                model: state.model,
                sample_mode: state.sample_mode,
                sample_query: state.sample_query,
                seed: state.useRandomSeed ? -1 : state.seed,
                task_type: state.task_type,
                audio_cover_strength: state.audio_cover_strength,
                repainting_start: state.repainting_start,
                repainting_end: state.repainting_end,
                src_audio_path: srcAudioPath,
                use_adg: state.useAdg,
                reference_audio_path: (state.useAdg && srcAudioPath) ? srcAudioPath : null
            };

            const response = await fetch("http://localhost:8100/acestep/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || `Generation request failed (HTTP ${response.status})`);
            }

            const data = await response.json();
            if (data.data && data.data.task_id) {
                const taskId = data.data.task_id;
                setState(prev => ({ ...prev, taskId, status: "queued" }));
                startPolling(taskId);
            } else {
                throw new Error(data.detail || "Failed to start generation");
            }
        } catch (err: any) {
            console.error("[handleGenerate] Error:", err.message);
            setState(prev => ({ ...prev, isGenerating: false, error: err.message }));
        }
    };

    const startPolling = (taskId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:8100/acestep/status/${taskId}`);

                // Handle HTTP errors gracefully - don't show "Not Found" during processing
                if (!res.ok) {
                    console.warn(`Polling got HTTP ${res.status}, treating as still processing...`);
                    return; // Skip this poll cycle, don't update state with error
                }

                const data = await res.json();

                setState(prev => ({
                    ...prev,
                    status: data.status,
                    progress: data.progress,
                    output_files: data.output_files || [],
                    // Only show error if status is explicitly "failed"
                    error: data.status === "failed" ? (data.error || "Generation failed") : null
                }));

                if (data.status === "completed" || data.status === "failed") {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setState(prev => ({ ...prev, isGenerating: false }));

                    // Trigger post-processing if Repaint + AutoTrim is enabled
                    if (data.status === "completed" && state.task_type === 'repaint' && state.autoTrim && data.output_files && data.output_files.length > 0) {
                        const firstFileUrl = data.output_files[0].url;
                        if (firstFileUrl) {
                            console.log("[PostProcess] Triggering auto trim/fade for:", firstFileUrl);
                            fetch('http://localhost:8100/acestep/post-process', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    file_url: firstFileUrl,
                                    fade_duration: state.fadeDuration,
                                    auto_trim: state.autoTrim
                                })
                            }).then(res => res.json()).then(postData => {
                                if (postData.url) {
                                    console.log("[PostProcess] Success, updating UI with processed file:", postData.url);
                                    setState(prev => ({
                                        ...prev,
                                        output_files: [{
                                            ...data.output_files[0],
                                            url: `http://localhost:8100${postData.url}`,
                                            label: `Processed (Trimmed & Faded)`
                                        }, ...prev.output_files]
                                    }));
                                }
                            }).catch(e => console.error("[PostProcess] Failed:", e));
                        }
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setState(prev => ({ ...prev, imageFile: file }));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                setState(prev => ({ ...prev, imageFile: file }));
            }
        };
    };

    const clearImage = () => {
        setState(prev => ({ ...prev, imageFile: null }));
    };

    const handleAnalyzeImage = async () => {
        if (!state.imageFile) return;

        setState(prev => ({ ...prev, isAnalyzing: true, error: null }));

        try {
            // Use Gemini to analyze the image
            // We use a dummy text prompt if none exists, or use the current prompt as context
            const userPrompt = state.prompt || "Analyze this image and create a song description.";

            const result = await generateSunoPrompt(
                userPrompt,
                "", // No YouTube URL
                state.imageFile,
                GenerationMode.AUTO,
                { searchEngine: 'none', modelName: 'gemini-3.1-pro' },
                state.theme // Pass the theme/concept
            );

            if (result.bestSelection) {
                setState(prev => ({
                    ...prev,
                    prompt: result.bestSelection.style, // Map style to prompt
                    lyrics: result.bestSelection.content,
                    isAnalyzing: false
                }));
            } else {
                throw new Error("Failed to generate valid prompt from image.");
            }

        } catch (err: any) {
            console.error("Analysis failed:", err);
            setState(prev => ({ ...prev, isAnalyzing: false, error: "Image analysis failed: " + err.message }));
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full max-w-screen-xl mx-auto p-4 md:p-6 lg:p-8 min-h-screen bg-slate-950 font-sans selection:bg-indigo-500/30">
            {/* Header Removed */}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main Control Panel - Left Side */}
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
                                            <option value="acestep-v15-base">v1.5 Base (High Quality/高品質)</option>
                                            <option value="acestep-v15-turbo">v1.5 Turbo (Fast/高速)</option>
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Task Type Toggle: Text-to-Music / Cover */}
                            <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Generation Mode / 生成モード
                                        </label>
                                        <p className="text-[10px] text-slate-500">
                                            {state.task_type === 'text2music'
                                                ? 'Create new music from prompts / プロンプトから新規作成'
                                                : state.task_type === 'cover'
                                                    ? 'Arrange existing music / 既存楽曲をアレンジ'
                                                    : 'Extend audio context / 既存楽曲の続きを生成'}
                                        </p>
                                    </div>
                                    <div className="flex bg-slate-900/80 p-1 rounded-xl border border-white/5 w-fit ml-auto">
                                        <button
                                            onClick={() => handleTaskTypeChange('text2music')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${state.task_type === 'text2music' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            NEW
                                        </button>
                                        <button
                                            onClick={() => handleTaskTypeChange('cover')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${state.task_type === 'cover' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            COVER
                                        </button>
                                        <button
                                            onClick={() => handleTaskTypeChange('repaint')}
                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${state.task_type === 'repaint' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            REPAINT
                                        </button>
                                    </div>
                                </div>

                                {/* Repaint Mode Controls */}
                                {state.task_type === 'repaint' && (
                                    <div className="space-y-4 pt-3 border-t border-white/5 animate-in slide-in-from-top-2">
                                        <div className="flex bg-slate-800/50 p-1 rounded-lg">
                                            <button
                                                onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'upload' }))}
                                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverAudioSourceType === 'upload' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                File Upload
                                            </button>
                                            <button
                                                onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'url' }))}
                                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverAudioSourceType === 'url' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                URL Import
                                            </button>
                                        </div>

                                        {state.coverAudioSourceType === 'upload' ? (
                                            <div
                                                className={`relative w-full h-16 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${state.coverAudioFile ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}
                                                onDragOver={handleDragOver}
                                                onDrop={handleCoverAudioDrop}
                                            >
                                                <input
                                                    type="file"
                                                    accept="audio/*"
                                                    onChange={handleCoverAudioUpload}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                />
                                                {state.coverAudioFile ? (
                                                    <div className="relative z-20 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg text-xs font-bold text-cyan-300 backdrop-blur-sm border border-cyan-500/30">
                                                        <FileAudio className="w-3.5 h-3.5" />
                                                        {state.coverAudioFile.name}
                                                    </div>
                                                ) : (
                                                    <div className="text-center space-y-1 pointer-events-none">
                                                        <Upload className="w-4 h-4 mx-auto text-slate-500" />
                                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Source Audio (.mp3, .wav)</p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={state.coverAudioUrl || ''}
                                                    onChange={(e) => setState(prev => ({ ...prev, coverAudioUrl: e.target.value }))}
                                                    placeholder="Audio URL (YouTube, etc.)"
                                                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:ring-2 focus:ring-cyan-500/50 outline-none placeholder:text-slate-700"
                                                />
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3" />
                                                    Start (Sec)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={state.repainting_start}
                                                    onChange={(e) => setState(prev => ({ ...prev, repainting_start: parseFloat(e.target.value) }))}
                                                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                    <ArrowRight className="w-3 h-3" />
                                                    End (-1=Auto)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={state.repainting_end}
                                                    onChange={(e) => setState(prev => ({ ...prev, repainting_end: parseFloat(e.target.value) }))}
                                                    className="w-full bg-slate-900 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/50"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded-xl border border-white/5">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto Trim / フェード</span>
                                                <span className="text-[9px] text-slate-500 font-medium">小節でカット & {state.fadeDuration}秒フェード</span>
                                            </div>
                                            <div
                                                className={`relative w-8 h-4 rounded-full cursor-pointer transition-colors duration-300 ${state.autoTrim ? 'bg-cyan-500/80' : 'bg-slate-700'}`}
                                                onClick={() => setState(prev => ({ ...prev, autoTrim: !prev.autoTrim }))}
                                            >
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${state.autoTrim ? 'left-4.5' : 'left-0.5'}`} style={{ left: state.autoTrim ? '18px' : '2px' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Cover Mode Controls */}
                                {/* Cover Mode Controls */}
                                {state.task_type === 'cover' && (
                                    <div className="space-y-4 pt-3 border-t border-white/5 animate-in slide-in-from-top-2">

                                        {/* Source Type Selector */}
                                        <div className="flex bg-slate-800/50 p-1 rounded-lg">
                                            <button
                                                onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'upload' }))}
                                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverAudioSourceType === 'upload'
                                                    ? 'bg-slate-700 text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-300'
                                                    }`}
                                            >
                                                File Upload
                                            </button>
                                            <button
                                                onClick={() => setState(prev => ({ ...prev, coverAudioSourceType: 'url' }))}
                                                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverAudioSourceType === 'url'
                                                    ? 'bg-slate-700 text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-300'
                                                    }`}
                                            >
                                                URL Import
                                            </button>
                                        </div>

                                        {/* Cover Audio File Upload */}
                                        {state.coverAudioSourceType === 'upload' ? (
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                        <FileAudio className="w-3 h-3" />
                                                        Source Audio / 元の楽曲
                                                    </label>
                                                    {state.coverAudioFile && (
                                                        <button onClick={clearCoverAudio} className="text-slate-500 hover:text-red-400 transition-colors">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div
                                                    className={`relative w-full h-16 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${state.coverAudioFile ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={handleCoverAudioDrop}
                                                >
                                                    <input
                                                        type="file"
                                                        accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
                                                        onChange={handleCoverAudioUpload}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                    />
                                                    {state.coverAudioFile ? (
                                                        <div className="relative z-20 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg text-xs font-bold text-pink-300 backdrop-blur-sm border border-pink-500/30">
                                                            <FileAudio className="w-3.5 h-3.5" />
                                                            {state.coverAudioFile.name}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center space-y-1 pointer-events-none">
                                                            <Upload className="w-4 h-4 mx-auto text-slate-500" />
                                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Upload Audio File (.mp3, .wav, .flac)</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            /* URL Input */
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                    <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded font-serif italic text-slate-300">URL</span>
                                                    Audio URL (YouTube, etc.)
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={state.coverAudioUrl || ''}
                                                        onChange={(e) => setState(prev => ({ ...prev, coverAudioUrl: e.target.value }))}
                                                        placeholder="https://www.youtube.com/watch?v=..."
                                                        className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:ring-2 focus:ring-pink-500/50 outline-none placeholder:text-slate-700"
                                                    />
                                                </div>
                                                <p className="text-[9px] text-slate-500 italic">Supported: YouTube, SoundCloud, Suno, etc.</p>
                                            </div>
                                        )}

                                        {/* ADG Reference Audio Section - Simplified to Toggle only */}
                                        <div className="space-y-3 pt-3 border-t border-white/5">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                        <Sparkles className="w-3 h-3 text-pink-400" />
                                                        Reference Audio / アレンジ参考音源 (ADG)
                                                    </label>
                                                    <div
                                                        className={`relative w-8 h-4 rounded-full cursor-pointer transition-colors duration-300 ${state.useAdg ? 'bg-pink-500/80' : 'bg-slate-700'}`}
                                                        onClick={() => setState(prev => ({ ...prev, useAdg: !prev.useAdg }))}
                                                    >
                                                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 ${state.useAdg ? 'left-4.5' : 'left-0.5'}`} style={{ left: state.useAdg ? '18px' : '2px' }} />
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-slate-400">
                                                    Turn on to match the <span className="text-pink-300 font-bold">instrumentation, style, and vocal timbre (声質)</span> of the source track.
                                                    <br />
                                                    <span className="text-pink-400/80 italic">Enabled: Using the same audio source as above for style guidance.</span>
                                                </p>
                                            </div>
                                        </div>

                                        {/* Cover Strength Slider */}
                                        <div className="space-y-2 pt-2 border-t border-white/5">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                                    <Sliders className="w-3 h-3" />
                                                    Cover Strength / 声質・アレンジの反映度
                                                </label>
                                                <span className="text-[10px] font-mono text-pink-400 font-bold">{state.audio_cover_strength.toFixed(1)}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={state.audio_cover_strength}
                                                onChange={(e) => setState(prev => ({ ...prev, audio_cover_strength: parseFloat(e.target.value) }))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                            />
                                            <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                                                <span>Free / 自由</span>
                                                <span>Faithful / 忠実</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5 space-y-5">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                            Thinking Mode / 思考モード
                                            <div className="group relative">
                                                <AlertCircle className="w-3 h-3 text-slate-600 cursor-help" />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-[9px] text-slate-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-white/5 shadow-xl">
                                                    Prompt generation via 5Hz LM. ON strengthens instruction following and musical structure.
                                                    <br /><span className="text-indigo-400">ONにすると指示への忠実度と音楽構成力が向上します。</span>
                                                </div>
                                            </div>
                                        </label>
                                        <p className="text-[10px] text-slate-500">Refined plan for higher quality result</p>
                                    </div>
                                    <button
                                        onClick={() => setState(prev => ({ ...prev, thinking: !prev.thinking }))}
                                        className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${state.thinking ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${state.thinking ? 'left-7' : 'left-1'}`} />
                                    </button>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Clock className="w-3 h-3" />
                                            DURATION / 曲の長さ
                                        </label>
                                        <span className="text-[10px] font-mono text-indigo-400 font-bold">{state.duration === -1 ? 'AUTO (自動)' : `${state.duration}s`}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-1"
                                        max="300"
                                        step="1"
                                        value={state.duration}
                                        onChange={(e) => setState(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6 pt-2">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">STEPS / ステップ数</label>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setState(prev => ({ ...prev, inference_steps: 32 }))}
                                                    className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition-all ${state.inference_steps === 32 ? 'bg-indigo-600 text-white ring-1 ring-indigo-400' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 cursor-pointer'}`}
                                                >
                                                    HQ: 32+
                                                </button>
                                                <span className="text-[10px] font-mono text-slate-400 font-bold">{state.inference_steps}</span>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max={state.model.includes('turbo') ? 20 : 100}
                                            value={state.inference_steps}
                                            onChange={(e) => setState(prev => ({ ...prev, inference_steps: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">BATCH / 生成数</label>
                                            <span className="text-[10px] font-mono text-slate-400 font-bold">{state.batch_size}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="4"
                                            value={state.batch_size}
                                            onChange={(e) => setState(prev => ({ ...prev, batch_size: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Seed Input */}
                                <div className="space-y-3 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Settings2 className="w-3 h-3" />
                                            SEED / シード値
                                        </label>
                                        <button
                                            onClick={() => setState(prev => ({ ...prev, seed: -1 }))}
                                            className="text-[9px] font-mono text-indigo-400 font-bold hover:text-indigo-300 transition-colors uppercase cursor-pointer"
                                        >
                                            {state.seed === -1 ? 'RANDOM (ランダム)' : 'RESET'}
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        value={state.seed === -1 ? '' : state.seed}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setState(prev => ({ ...prev, seed: val === '' ? -1 : parseInt(val) }));
                                        }}
                                        placeholder="Random (-1)"
                                        className="w-full bg-slate-800 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={state.isGenerating || (state.task_type === 'cover' && ((state.coverAudioSourceType === 'upload' && !state.coverAudioFile) || (state.coverAudioSourceType === 'url' && !state.coverAudioUrl)))}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] mt-4 ${(state.isGenerating || (state.task_type === 'cover' && ((state.coverAudioSourceType === 'upload' && !state.coverAudioFile) || (state.coverAudioSourceType === 'url' && !state.coverAudioUrl))))
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : state.task_type === 'cover'
                                        ? 'bg-gradient-to-r from-pink-600 via-rose-600 to-orange-600 text-white hover:shadow-pink-500/30'
                                        : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white hover:shadow-indigo-500/30'
                                    }`}
                            >
                                {state.isGenerating ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing / 生成中...
                                    </>
                                ) : state.task_type === 'cover' ? (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Create Cover (Timbre Transfer) / カバー作成（声質反映）
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 fill-current" />
                                        Create Music / 音楽作成
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex flex-col h-full bg-slate-950/20 rounded-2xl border border-white/5 p-4 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block pl-1">Theme / テーマ</label>
                                {/* Increased height for Theme input (double from previous) - using textarea for multi-line */}
                                <textarea
                                    value={state.theme}
                                    onChange={(e) => setState(prev => ({ ...prev, theme: e.target.value }))}
                                    className="w-full h-24 bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none text-sm placeholder:text-slate-700 transition-all font-medium resize-none leading-relaxed custom-scrollbar"
                                    placeholder="Examples: Cyberpunk City, Morning Coffee..."
                                />
                            </div>

                            <div className="space-y-2 flex-1 flex flex-col h-full overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <Music className="w-3.5 h-3.5" />
                                        Lyrics & Structure / 歌詞と構成
                                    </label>

                                    {/* Lyrics Mode Selector (Cover mode only) */}
                                    {state.task_type === 'cover' && (
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => setState(prev => ({ ...prev, coverLyricsMode: 'custom' }))}
                                                className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverLyricsMode === 'custom'
                                                    ? 'bg-indigo-600/80 text-white shadow-sm'
                                                    : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                                                    }`}
                                            >
                                                ✍️ Custom
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setState(prev => ({ ...prev, coverLyricsMode: 'original' }));
                                                }}
                                                className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider rounded-md transition-all ${state.coverLyricsMode === 'original'
                                                    ? 'bg-pink-600/80 text-white shadow-sm'
                                                    : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                                                    }`}
                                            >
                                                🎤 Original
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Extract Lyrics Button (Cover + Original mode) */}
                                {state.task_type === 'cover' && state.coverLyricsMode === 'original' && (
                                    <button
                                        onClick={handleExtractLyrics}
                                        disabled={state.isExtractingLyrics || !state.coverAudioUrl}
                                        className={`w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${state.isExtractingLyrics
                                            ? 'bg-pink-800/30 text-pink-300 cursor-wait'
                                            : !state.coverAudioUrl
                                                ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                                                : 'bg-pink-600/20 text-pink-300 hover:bg-pink-600/30 border border-pink-500/20 hover:border-pink-500/40'
                                            }`}
                                    >
                                        {state.isExtractingLyrics ? (
                                            <><Loader2 className="w-3 h-3 animate-spin" /> Extracting Lyrics... / 歌詞抽出中...</>
                                        ) : (
                                            <><RefreshCw className="w-3 h-3" /> Extract from URL / URLから歌詞を抽出</>
                                        )}
                                    </button>
                                )}

                                <textarea
                                    value={state.lyrics}
                                    onChange={(e) => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                                    className="w-full flex-1 bg-transparent border-none rounded-xl p-2 text-slate-200 focus:ring-0 outline-none resize-none font-mono text-xs leading-relaxed custom-scrollbar selection:bg-indigo-500/30 min-h-[120px] overflow-y-auto"
                                    placeholder={state.task_type === 'cover' && state.coverLyricsMode === 'original' ? 'Click "Extract from URL" to auto-fill lyrics...' : '[Intro]\n[Verse]\nLyrics here...'}
                                />
                                <p className="text-[9px] text-slate-500 italic font-medium">
                                    {state.task_type === 'cover' && state.coverLyricsMode === 'original'
                                        ? 'Extracted lyrics can be edited before generation. / 抽出された歌詞は生成前に修正できます。'
                                        : 'Use tags like [Verse], [Chorus] to control structure.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {state.error && !state.isGenerating && (
                        <div className="mt-6 bg-red-400/5 border border-red-400/20 text-red-400 p-4 rounded-xl text-xs flex items-center gap-3 shadow-lg">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span className="font-bold">Error:</span> {state.error}
                        </div>
                    )}
                </div>
            </div>

            {/* Results Sidebar/Drawer Style */}
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
                                            </div>
                                        </div>

                                        <div className="w-full md:flex-1">
                                            <WaveformPlayer
                                                src={item.url}
                                                title={state.generatedTitle || `${state.prompt.replace(/,/g, '').slice(0, 20)}...`}
                                                subtitle={`Variation ${idx + 1}`}
                                            />
                                        </div>
                                    </div>

                                    {/* Voice Change Section */}
                                    <div className="px-6 md:px-8 pb-6">
                                        {voiceChange.activeIndex !== idx ? (
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
                                                {voiceChange.status === 'separating' && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-200">
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Separating Vocals & instrumental... / 音源分離中...
                                                            </div>
                                                            <span>{Math.round(voiceChange.progress)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                            <div
                                                                className="h-full transition-all duration-300 ease-out bg-gradient-to-r from-amber-500 to-orange-500"
                                                                style={{ width: `${voiceChange.progress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Step 2: Ready */}
                                                {voiceChange.status === 'ready' && (
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
                                                                    className={`relative w-full h-14 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${voiceChange.newVocalsFile ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}
                                                                >
                                                                    <input
                                                                        type="file"
                                                                        accept="audio/*"
                                                                        onChange={handleNewVocalsUpload}
                                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                    />
                                                                    {voiceChange.newVocalsFile ? (
                                                                        <div className="relative z-20 flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-300 backdrop-blur-sm border border-amber-500/30">
                                                                            <FileAudio className="w-3 h-3" />
                                                                            {voiceChange.newVocalsFile.name}
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
                                                                            <span className="text-indigo-400">{voiceChange.diffusionSteps}</span>
                                                                        </div>
                                                                        <input
                                                                            type="range" min="4" max="100" step="1"
                                                                            value={voiceChange.diffusionSteps}
                                                                            onChange={(e) => setVoiceChange(p => ({ ...p, diffusionSteps: parseInt(e.target.value) }))}
                                                                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                                                        />
                                                                        <p className="text-[8px] text-slate-500 italic">Density/Quality. higher=better but slower. / 変換密度。高いほど高品質ですが時間がかかります。</p>
                                                                    </div>

                                                                    <div className="space-y-1.5">
                                                                        <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                                            <span>Pitch Shift (Semitones)</span>
                                                                            <span className={voiceChange.pitchShift === 0 ? "text-slate-500" : "text-amber-400"} >
                                                                                {voiceChange.pitchShift > 0 ? `+${voiceChange.pitchShift}` : voiceChange.pitchShift}
                                                                            </span>
                                                                        </div>
                                                                        <input
                                                                            type="range" min="-12" max="12" step="1"
                                                                            value={voiceChange.pitchShift}
                                                                            onChange={(e) => setVoiceChange(p => ({ ...p, pitchShift: parseInt(e.target.value) }))}
                                                                            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                                        />
                                                                        <p className="text-[8px] text-slate-500 italic">Adjust vocal pitch. / 声の高さを半音単位で調整します。</p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-wrap gap-4 pt-2">
                                                                    <div className="space-y-1">
                                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                                            <div
                                                                                onClick={() => setVoiceChange(p => ({ ...p, f0Condition: !p.f0Condition }))}
                                                                                className={`w-8 h-4 rounded-full transition-colors relative ${voiceChange.f0Condition ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                                                            >
                                                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${voiceChange.f0Condition ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                            </div>
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">F0 Condition (SVC)</span>
                                                                        </label>
                                                                        <p className="text-[7px] text-slate-600 pl-10 italic">Better pitch tracking. / ピッチ追従性を向上させます。</p>
                                                                    </div>

                                                                    <div className="space-y-1">
                                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                                            <div
                                                                                onClick={() => setVoiceChange(p => ({ ...p, autoF0Adjust: !p.autoF0Adjust }))}
                                                                                className={`w-8 h-4 rounded-full transition-colors relative ${voiceChange.autoF0Adjust ? 'bg-amber-600' : 'bg-slate-700'}`}
                                                                            >
                                                                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${voiceChange.autoF0Adjust ? 'translate-x-4' : 'translate-x-0'}`} />
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
                                                                    disabled={!voiceChange.newVocalsFile}
                                                                    className={`w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${!voiceChange.newVocalsFile
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
                                                {voiceChange.status === 'converting' && (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-200">
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Converting Voice & Merging... / 声を変換＆合成中...
                                                            </div>
                                                            <span>{Math.round(voiceChange.progress)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                            <div
                                                                className={`h-full transition-all duration-300 ease-out bg-gradient-to-r from-amber-500 to-orange-500`}
                                                                style={{ width: `${voiceChange.progress}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-amber-500/50 tracking-wider">
                                                            This may take 1-3 minutes depending on GPU. / GPUによって1〜3分かかる場合があります。
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Step 4: Done */}
                                                {voiceChange.status === 'done' && voiceChange.mergedUrl && (
                                                    <div className="space-y-3 animate-in zoom-in-95 duration-500">
                                                        <div className="flex items-center justify-between text-xs font-bold">
                                                            <div className="flex items-center gap-2 text-green-400">
                                                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                                                Voice Change Complete! / ボーカル置換完了！
                                                            </div>
                                                            {voiceChange.processingTime && (
                                                                <span className="text-[10px] text-slate-400 font-medium bg-slate-800/50 px-2 py-0.5 rounded">
                                                                    ⏱️ {Math.floor(voiceChange.processingTime / 60)}m {Math.floor(voiceChange.processingTime % 60)}s
                                                                </span>
                                                            )}
                                                        </div>
                                                        <WaveformPlayer
                                                            src={voiceChange.mergedUrl}
                                                            title="Voice Changed Result"
                                                            subtitle="Merged Output"
                                                        />
                                                        <a
                                                            href={voiceChange.mergedUrl}
                                                            onClick={(e) => {
                                                                const songTitle = voiceChange.songTitle || 'Generated_Song';
                                                                const singer = voiceChange.newVocalsFile?.name?.replace(/\.[^/.]+$/, "") || "Cover";
                                                                const safeName = `[${singer}]_${songTitle}.wav`.replace(/[\/\\?%*:|"<>]/g, '-');
                                                                if (voiceChange.mergedUrl) handleDownloadFile(e, voiceChange.mergedUrl, safeName);
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
                                                {voiceChange.status === 'failed' && (
                                                    <div className="p-3 bg-red-400/5 border border-red-400/20 rounded-xl flex items-center gap-2 text-red-400 text-[10px] font-medium animate-shake">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        <span>{voiceChange.error || 'Unknown Error'}</span>
                                                    </div>
                                                )}

                                                {/* Cancel / Reset Button */}
                                                {voiceChange.status !== 'done' && (
                                                    <div className="flex justify-center pt-2">
                                                        <button
                                                            onClick={() => {
                                                                if (vcPollRef.current) clearInterval(vcPollRef.current);
                                                                setVoiceChange(prev => ({ ...prev, activeIndex: null, status: 'idle', taskId: null, progress: 0, instrumentalUrl: null, vocalsUrl: null, newVocalsFile: null, mergedUrl: null, error: null }));
                                                            }}
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
        </div>
    );
};

export default AceStepTab;

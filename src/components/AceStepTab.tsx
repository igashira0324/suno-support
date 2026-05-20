import { AceStepLeftPanel } from './acestep/AceStepLeftPanel';
import { AceStepRightPanel } from './acestep/AceStepRightPanel';
import { VoiceChangeState } from './acestep/types';
import React, { useState, useEffect, useRef } from 'react';
import { AceStepState, GenerationMode } from '../types';
import { generateSunoPrompt, generateTitle, structureLyrics, generateStyleFromLyrics } from '../services/geminiService';
import WaveformPlayer from './WaveformPlayer';
import { API_BASE_URL } from '@/config/api';

const AceStepTab: React.FC = () => {
    const [state, setState] = useState<AceStepState>({
        prompt: "Dark EDM, Cyberpunk, 165 BPM, Aggressive Synths, Heavy Bass, Emotional Female Vocal, Cinematic, Glitchy, Grand & Magnificent orchestral music",
        lyrics: "[Instrumental]\n\n[Intro]\n[bright sawtooth lead synth motif, sub-heavy synth bass pulse]\n[Whisper]\n想いは、永遠（とわ）に降り注ぐ……。\n\n[Verse 1]\n冷たい土に 膝をついて\n千切れた羽を 風がさらう\n誰かの明日（あす）を 守れるなら\nこの痛みさえ 愛しいから\n\n[Verse 2]\n(Soft strings join the acoustic guitar)\nロケットの中 記憶のノイズ\n雨降る街で 震える肩へ\n触れることない この両手でも\nせめて祈りを 寄り添わせて\n\n[Section A]\n[electronic snare and kick enter, four-on-the-floor pattern]\n[shimmering synth pads with sidechain compression]\n\n[Pre-Chorus]\n(Tempo builds up, subtle tribal percussion starts)\n見えない夜を 彷徨う魂\nだけど世界は 見捨てなかった\n集まる光 無数の声が\n孤独な闇を 照らし出す！\n[Gasp]\n\n[Chorus]\n[Powerful Ethereal Vocal]\n舞い上がれ！ 黄金（きん）の翼で！\n感謝の輝きが 私を包むの\n解き放たれた 新しい命で\n夜明けの空へ 希望の羽（はね）を\n降らせていくの どこまでも！\n\n[Section B]\n[filter sweep on lead synth, gated synth textures]\n[square-wave synth counter-melody enters]\n\n[Spoken Word]\n「泣かないで。私はずっと、ここから見守っているから。」\n[Singing]\n雲の海から 見下ろす世界\nあの日の少女が 今、微笑む\n\n[Build Up]\n(Rolling snare, massive orchestral crescendo)\n永遠の愛（Eternal love）……\n超えてゆけ！\n\n[Final Chorus]\n[Maximum Energy, Full Orchestra & Choir]\n舞い上がれ！ 黄金（きん）の翼で！\n終わらない物語（おとぎばなし） 奇跡を紡いで\n永遠の守護（まもり） 誓ったこの空で\n光となって 風となって\nあなたをずっと 愛してる！\n\n[Outro]\n[drums drop out, fading synth pads and lead motif]",
        thinking: true,
        inference_steps: 32,
        batch_size: 1,
        duration: -1,
        language: "ja",
        model: "acestep-v15-xl-sft",
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
        theme: "Fallen Diva in Darkness / 闇に堕ちた歌姫",
        seed: -1,
        task_type: "text2music",
        coverRepaintUseLm: false,
        coverAudioSourceType: 'upload',
        coverAudioUrl: '',
        coverAudioFile: null,
        audio_cover_strength: 0.9,
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
        startTime: undefined,
        processingTime: undefined
    });

    const [visualProgress, setVisualProgress] = useState(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const vcPollRef = useRef<NodeJS.Timeout | null>(null);
    const isTurboModel = (model: string) => model.includes('turbo');
    const isBaseModel = (model: string) => model.includes('base');

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

            const res = await fetch(`${API_BASE_URL}/separate-generated`, {
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
                    const statusRes = await fetch(`${API_BASE_URL}/task/${data.task_id}`);
                    if (!statusRes.ok) return;
                    const statusData = await statusRes.json();
                    setVoiceChange(prev => ({ ...prev, progress: statusData.progress || 0 }));
                    if (statusData.status === 'completed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({
                            ...prev,
                            status: 'ready',
                            progress: 100,
                            instrumentalUrl: `${API_BASE_URL}${statusData.result?.instrumental_url}`,
                            vocalsUrl: `${API_BASE_URL}${statusData.result?.vocals_url}`
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

            const res = await fetch(`${API_BASE_URL}/voice-convert`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Conversion failed to start');
            const data = await res.json();

            setVoiceChange(prev => ({ ...prev, taskId: data.task_id }));

            if (vcPollRef.current) clearInterval(vcPollRef.current);
            vcPollRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${API_BASE_URL}/task/${data.task_id}`);
                    if (!statusRes.ok) return;
                    const statusData = await statusRes.json();
                    setVoiceChange(prev => ({ ...prev, progress: statusData.progress || 0 }));

                    if (statusData.status === 'completed') {
                        if (vcPollRef.current) clearInterval(vcPollRef.current);
                        setVoiceChange(prev => ({
                            ...prev,
                            status: 'done',
                            progress: 100,
                            mergedUrl: `${API_BASE_URL}${statusData.result?.merged_url}`,
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

    const handleCancelVoiceChange = () => {
        if (vcPollRef.current) clearInterval(vcPollRef.current);
        setVoiceChange(prev => ({
            ...prev,
            activeIndex: null,
            status: 'idle',
            taskId: null,
            progress: 0,
            instrumentalUrl: null,
            vocalsUrl: null,
            newVocalsFile: null,
            mergedUrl: null,
            error: null,
        }));
    };

    // Extract lyrics from URL (YouTube subtitles or Whisper)
    const handleExtractLyrics = async () => {
        const url = state.coverAudioUrl;
        if (!url) {
            setState(prev => ({ ...prev, error: 'Please enter a URL first to extract lyrics.' }));
            return;
        }
        setState(prev => ({ ...prev, isExtractingLyrics: true, error: null }));
        try {
            const res = await fetch(`${API_BASE_URL}/acestep/extract-lyrics`, {
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
                let currentPrompt = state.prompt;
                if (data.prompt) {
                    console.log('[LyricsExtract] Backend provided prompt:', data.prompt);
                    currentPrompt = data.prompt;
                }

                // If it's from Suno, use it directly as requested by the user
                if (data.method && data.method.startsWith('suno_')) {
                    console.log('[LyricsExtract] Suno direct lyrics - bypassing AI structuring');
                    setState(prev => ({ ...prev, lyrics: data.lyrics, prompt: currentPrompt, isExtractingLyrics: false }));
                    return;
                }

                // Step 2: Use Local LLM (or Gemini AI fallback) to clean up and add structure tags
                console.log('[LyricsExtract] Raw lyrics received, length:', data.lyrics.length);
                console.log('[LyricsExtract] Calling structureLyrics with prompt:', currentPrompt?.substring(0, 50), 'theme:', state.theme?.substring(0, 50));
                try {
                    let newPrompt = currentPrompt;
                    if (!data.prompt || data.prompt.trim() === '') {
                        console.log('[LyricsExtract] Generating new style prompt from lyrics...');
                        const generatedStyle = await generateStyleFromLyrics(data.lyrics, url, state.theme, state.language);
                        if (generatedStyle) {
                            newPrompt = generatedStyle;
                            console.log('[LyricsExtract] Generated Style:', generatedStyle);
                        }
                    }

                    // 無料枠の同時アクセスを避けるため直列で処理
                    const structured = await structureLyrics(
                        data.lyrics,
                        currentPrompt,
                        state.theme,
                        state.language
                    );

                    console.log('[LyricsExtract] Structured lyrics received, length:', structured.length);
                    setState(prev => ({ ...prev, lyrics: structured, prompt: newPrompt, isExtractingLyrics: false }));
                } catch (aiErr) {
                    console.error('[LyricsExtract] AI structuring FAILED:', aiErr);
                    setState(prev => ({ ...prev, lyrics: data.lyrics, prompt: currentPrompt, isExtractingLyrics: false }));
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
        const isTurbo = isTurboModel(newModel);
        setState(prev => ({
            ...prev,
            model: newModel,
            inference_steps: isTurbo ? 8 : 32,
            // Turbo does not support Thinking Mode, and Lego requires a base-family model.
            thinking: isTurbo ? false : prev.thinking,
            coverRepaintUseLm: isTurbo ? false : prev.coverRepaintUseLm,
            task_type: (!isBaseModel(newModel) && prev.task_type === 'lego') ? 'text2music' : prev.task_type
        }));
    };

    // Task type change handler: auto-fill prompt for cover/repaint mode
    const handleTaskTypeChange = (nextType: string) => {
        setState(prev => {
            let nextPrompt = prev.prompt;

            // If switching to cover/repaint and prompt is default or empty, set to reasonable default
            if (nextType === 'cover' && (prev.prompt === "" || prev.prompt === "Dark EDM, Cyberpunk, 165 BPM, Aggressive Synths, Heavy Bass, Emotional Female Vocal, Cinematic, Glitchy, Grand & Magnificent orchestral music")) {
                nextPrompt = "Faithful cover, original melody, high fidelity";
            } else if (nextType === 'repaint' && (prev.prompt === "" || prev.prompt === "Dark EDM, Cyberpunk, 165 BPM, Aggressive Synths, Heavy Bass, Emotional Female Vocal, Cinematic, Glitchy, Grand & Magnificent orchestral music")) {
                nextPrompt = "Extend song, same style and orchestration, seamless transition";
            } else if (nextType === 'lego' && (prev.prompt === "" || prev.prompt === "Dark EDM, Cyberpunk, 165 BPM, Aggressive Synths, Heavy Bass, Emotional Female Vocal, Cinematic, Glitchy, Grand & Magnificent orchestral music")) {
                nextPrompt = "Emotional J-pop vocal, expressive, melodic, match the BGM style";
            } else if (nextType === 'text2music' && (
                prev.prompt === "Faithful cover, original melody, high fidelity" ||
                prev.prompt === "Extend song, same style and orchestration, seamless transition" ||
                prev.prompt === "Emotional J-pop vocal, expressive, melodic, match the BGM style"
            )) {
                nextPrompt = "Dark EDM, Cyberpunk, 165 BPM, Aggressive Synths, Heavy Bass, Emotional Female Vocal, Cinematic, Glitchy, Grand & Magnificent orchestral music";
            }

            return {
                ...prev,
                task_type: nextType,
                prompt: nextPrompt,
                // When leaving lego, if it was automatically turned on, we don't need to force it anymore, just keep current state
                thinking: (nextType === 'cover' || nextType === 'repaint')
                    ? (isTurboModel(prev.model) ? false : true)
                    : prev.thinking
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
        setState(prev => ({
            ...prev,
            isGenerating: true,
            error: null,
            progress: 0,
            status: "starting",
            output_files: [],
            generatedTitle: undefined,
            startTime: Date.now(),
            processingTime: undefined
        }));
        setVisualProgress(0); // Reset visual progress bar

        // Fire title generation
        // We don't await here to let music generation start immediately
        generateTitle(state.lyrics, state.theme, state.prompt)
            .then(title => {
                setState(prev => ({ ...prev, generatedTitle: title }));
            })
            .catch(err => console.error("Title generation background failed:", err));

        try {
            // If Cover or Repaint or Lego mode, upload audio file OR download from URL
            let srcAudioPath: string | null = null;
            if (state.task_type === 'cover' || state.task_type === 'repaint' || state.task_type === 'lego') {
                if (state.coverAudioSourceType === 'upload' && state.coverAudioFile) {
                    const formData = new FormData();
                    formData.append('file', state.coverAudioFile);
                    const uploadRes = await fetch(`${API_BASE_URL}/acestep/upload-source`, {
                        method: 'POST',
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (!uploadData.path) throw new Error('Failed to upload source audio');
                    srcAudioPath = uploadData.path;
                    // Set preview URL for uploaded file
                    const uploadFilename = srcAudioPath!.split(/[\\/]/).pop();
                    if (uploadFilename) {
                        setProcessedAudioUrl(`${API_BASE_URL}/uploads/acestep_source/${uploadFilename}`);
                    }
                } else if (state.coverAudioSourceType === 'url' && state.coverAudioUrl) {
                    // Download from URL
                    setState(prev => ({ ...prev, isDownloadingSource: true }));
                    try {
                        const downloadRes = await fetch(`${API_BASE_URL}/acestep/download-url`, {
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
                            setProcessedAudioUrl(`${API_BASE_URL}/uploads/acestep_source/${downloadFilename}`);
                        }
                    } finally {
                        setState(prev => ({ ...prev, isDownloadingSource: false }));
                    }
                } else {
                    setState(prev => ({
                        ...prev,
                        error: "Source audio (Upload or URL) is required for Cover, Repaint, or Lego mode.",
                        isGenerating: false
                    }));
                    return;
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
                thinking: state.task_type === 'lego' ? true : state.thinking,
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
                cover_repaint_use_lm: (state.task_type === 'cover')
                    ? state.coverRepaintUseLm
                    : false,
                repainting_start: state.repainting_start,
                repainting_end: state.repainting_end,
                src_audio_path: srcAudioPath,
                use_adg: state.useAdg,
                reference_audio_path: (state.useAdg && srcAudioPath) ? srcAudioPath : null,
                theme: state.theme.trim(),
                track_name: state.task_type === 'lego' ? state.legoTrackName : undefined,
                shift: state.shift,
                guidance_scale: state.guidance_scale,
                infer_method: state.infer_method
            };

            const response = await fetch(`${API_BASE_URL}/acestep/generate`, {
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
                const res = await fetch(`${API_BASE_URL}/acestep/status/${taskId}`);

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
                    setState(prev => ({
                        ...prev,
                        isGenerating: false,
                        processingTime: (data.status === "completed" && prev.startTime)
                            ? (Date.now() - prev.startTime) / 1000
                            : prev.processingTime
                    }));

                    // Trigger post-processing if Repaint + AutoTrim is enabled
                    if (data.status === "completed" && state.task_type === 'repaint' && state.autoTrim && data.output_files && data.output_files.length > 0) {
                        const firstFileUrl = data.output_files[0].url;
                        if (firstFileUrl) {
                            console.log("[PostProcess] Triggering auto trim/fade for:", firstFileUrl);
                            fetch(`${API_BASE_URL}/acestep/post-process`, {
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
                                            url: `${API_BASE_URL}${postData.url}`,
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
            <AceStepLeftPanel 
                state={state} setState={setState} visualProgress={visualProgress} 
                processedAudioUrl={processedAudioUrl} setProcessedAudioUrl={setProcessedAudioUrl} 
                voiceChangeState={voiceChange} setVoiceChangeState={setVoiceChange} 
                isTurboModel={isTurboModel} isBaseModel={isBaseModel} 
                handleDownloadFile={handleDownloadFile} handleStartVoiceChange={handleStartVoiceChange} 
                handleNewVocalsUpload={handleNewVocalsUpload} handleConvertAndMerge={handleConvertAndMerge} 
                handleExtractLyrics={handleExtractLyrics} handleModelChange={handleModelChange} 
                handleTaskTypeChange={handleTaskTypeChange} handleCoverAudioUpload={handleCoverAudioUpload} 
                handleCoverAudioDrop={handleCoverAudioDrop} clearCoverAudio={clearCoverAudio} 
                handleReferenceAudioUpload={handleReferenceAudioUpload} handleReferenceAudioDrop={handleReferenceAudioDrop} 
                clearReferenceAudio={clearReferenceAudio} handleGenerate={handleGenerate} 
                handleImageUpload={handleImageUpload} handleDragOver={handleDragOver} 
                handleDrop={handleDrop} clearImage={clearImage} handleAnalyzeImage={handleAnalyzeImage}
                isDownloading={isDownloading} onCancelVoiceChange={handleCancelVoiceChange}
            />
        </div>
        
        <AceStepRightPanel 
            state={state} setState={setState} visualProgress={visualProgress} 
            processedAudioUrl={processedAudioUrl} setProcessedAudioUrl={setProcessedAudioUrl} 
            voiceChangeState={voiceChange} setVoiceChangeState={setVoiceChange} 
            isTurboModel={isTurboModel} isBaseModel={isBaseModel} 
            handleDownloadFile={handleDownloadFile} handleStartVoiceChange={handleStartVoiceChange} 
            handleNewVocalsUpload={handleNewVocalsUpload} handleConvertAndMerge={handleConvertAndMerge} 
            handleExtractLyrics={handleExtractLyrics} handleModelChange={handleModelChange} 
            handleTaskTypeChange={handleTaskTypeChange} handleCoverAudioUpload={handleCoverAudioUpload} 
            handleCoverAudioDrop={handleCoverAudioDrop} clearCoverAudio={clearCoverAudio} 
            handleReferenceAudioUpload={handleReferenceAudioUpload} handleReferenceAudioDrop={handleReferenceAudioDrop} 
            clearReferenceAudio={clearReferenceAudio} handleGenerate={handleGenerate} 
            handleImageUpload={handleImageUpload} handleDragOver={handleDragOver} 
            handleDrop={handleDrop} clearImage={clearImage} handleAnalyzeImage={handleAnalyzeImage}
            isDownloading={isDownloading} onCancelVoiceChange={handleCancelVoiceChange}
        />
    </div>
  );
};
export default AceStepTab;

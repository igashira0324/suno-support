export type AceStepTaskType = 'text2music' | 'cover' | 'repaint' | 'lego' | 'vocal_overlay' | 'complete' | 'lora';

export interface AceStepState {
    prompt: string;
    lyrics: string;
    thinking: boolean;
    inference_steps: number;
    batch_size: number;
    duration: number;
    language: string;
    model: string;
    sample_mode: boolean;
    sample_query: string;
    isGenerating: boolean;
    taskId: string | null;
    status: 'idle' | 'starting' | 'queued' | 'running' | 'completed' | 'failed' | 'processing';
    progress: number;
    output_files: any[];
    error: string | null;
    imageFile: File | null;
    isAnalyzing: boolean;
    theme: string;
    generatedTitle?: string;
    seed: number;
    task_type: AceStepTaskType;
    coverAudioSourceType: 'upload' | 'url';
    coverAudioUrl: string;
    coverAudioFile: File | null;
    audio_cover_strength: number;
    coverLyricsMode: 'custom' | 'extract';
    isExtractingLyrics: boolean;
    useAdg: boolean;
    referenceAudioSourceType: 'upload' | 'url';
    referenceAudioUrl: string;
    referenceAudioFile: File | null;
    isDownloadingSource: boolean;
    repainting_start: number;
    repainting_end: number;
    autoTrim: boolean;
    fadeDuration: number;
    useRandomSeed: boolean;
    legoTrackName: string;
    // Vocal-overlay mode: preserve original instrumental exactly, layer AI vocals on top
    vocalGain: number;
    masterOverlay: boolean;
    shift: number;
    guidance_scale: number;
    infer_method: 'ode' | 'sde';
    // Musical metadata locks: constrained decoding injects these into the LM plan.
    // null/empty = auto (model decides). Filled manually or via "曲情報を解析".
    bpm: number | null;
    keyScale: string;
    timeSignature: string;
    isAnalyzingProfile: boolean;
    stylePreset: 'none' | 'suno' | 'realistic' | 'vintage';
    startTime?: number;
    processingTime?: number;
    isAceStepReady: boolean;
    healthError: string | null;
}

export interface VoiceChangeState {
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

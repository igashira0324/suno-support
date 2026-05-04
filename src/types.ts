export enum MediaType {
    NONE = 'NONE',
    IMAGE = 'IMAGE',
    VIDEO = 'VIDEO'
}

export enum GenerationMode {
    AUTO = 'AUTO',
    VOCAL = 'VOCAL',
    INSTRUMENTAL = 'INSTRUMENTAL'
}

export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-3.1-pro-preview';

export type LyricsLanguage = 'Japanese' | 'English';

export type SearchEngine = 'google-grounding' | 'google-custom' | 'tavily' | 'none';

export interface MVScene {
    scene_number: number;
    scene_name: string;
    timestamp: string;
    section: string;
    lyrics_excerpt: string;
    prompt_en: string;
    camera: string;
    effect: string;
    color_palette: string;
    genspark_prompt: string;
    continuity_notes: {
        character: string;
        color_shift: string;
        key_object_carry: string;
    };
    mood: string;
}

export interface MVTimeline {
    scenes: MVScene[];
    evaluation_criteria: {
        must_include: string;
        style_consistency: string;
        color_evolution: string[];
        aspect_ratio: string;
        negative_prompt: string;
        quality_threshold: number;
        max_retries: number;
    };
}

export interface SongSelection {
    title: string;
    style: string;
    instrumental: boolean;
    content: string;
    comment?: string;
    timeline?: string | MVTimeline;
    minimaxAudioUrl?: string;
    isMinimaxGenerating?: boolean;
    minimaxError?: string | null;
}

export interface GroundingSource {
    uri: string;
    title: string;
}

export interface SunoResponse {
    analysis: string;
    titleCandidates: string[];
    styleCandidates: string[];
    bestSelection: SongSelection;
    alternativeSelection: SongSelection;
    sources?: GroundingSource[];
    tokenUsage?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
    // For multi-selection flow
    generatedSelections?: Array<SongSelection & { tokenUsage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number } }>;
    generatedTitles?: string[];
}

export interface AppState {
    inputText: string;
    youtubeUrl: string;
    mediaFile: File | null;
    mediaType: MediaType;
    generationMode: GenerationMode;
    isLoading: boolean;
    result: SunoResponse | null;
    error: string | null;
    searchEngine: SearchEngine;
    modelName: GeminiModel;
    enableVideoAnalysis: boolean;
    lyricsLanguage: LyricsLanguage;
}

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
    status: string;
    progress: number;
    output_files: any[];
    error: string | null;
    imageFile: File | null;
    isAnalyzing: boolean;
    theme: string;
    generatedTitle?: string;
    seed: number;
    task_type: string;
    coverAudioSourceType: 'upload' | 'url';
    coverAudioUrl: string;
    coverAudioFile: File | null;
    audio_cover_strength: number;
    coverLyricsMode: 'custom' | 'original';
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
    shift: number;
    guidance_scale: number;
    infer_method: 'ode' | 'sde';
    startTime?: number;
    processingTime?: number;
}


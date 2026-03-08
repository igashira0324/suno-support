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

export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-2.5-flash';

export type LyricsLanguage = 'Japanese' | 'English';

export type SearchEngine = 'google-grounding' | 'google-custom' | 'tavily' | 'none';

export interface SongSelection {
    title: string;
    style: string;
    instrumental: boolean;
    content: string;
    comment?: string;
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
}

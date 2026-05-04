export interface SeparationResult {
    vocals_url: string;
    instrumental_url: string;
    vocals_path: string;
    instrumental_path: string;
    original_path?: string;
}

export interface TaskState {
    id: string | null;
    status: 'idle' | 'uploading' | 'downloading' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    error: string | null;
    result: SeparationResult | null;
    originalName?: string;
}

export interface VoiceChangeState {
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

export type TrackType = 'original' | 'vocals' | 'instrumental';

// Audio Analysis Types
export interface IntensityPoint {
    time: number;
    value: number;
}

export interface AudioSegment {
    start: number;
    end: number;
    intensity: number;
    label: string;
}

export interface AudioAnalysis {
    success: boolean;
    duration?: number;
    bpm?: number;
    key?: string;
    intensity_curve?: IntensityPoint[];
    segments?: AudioSegment[];
    error?: string;
}

// CLAP Search Types
export interface CLAPResult {
    start: number;
    end: number;
    score: number;
    rank: number;
    label: string;
}

export interface CLAPPreset {
    id: string;
    label: string;
    query: string;
}

export interface CLAPSearchResponse {
    success: boolean;
    query?: string;
    results?: CLAPResult[];
    error?: string;
}

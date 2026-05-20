import React from 'react';
import { AceStepState } from '../../types';

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
    diffusionSteps: number;
    pitchShift: number;
    f0Condition: boolean;
    autoF0Adjust: boolean;
    songTitle?: string;
}

export interface AceStepComponentProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
    visualProgress: number;
    processedAudioUrl: string | null;
    setProcessedAudioUrl: React.Dispatch<React.SetStateAction<string | null>>;
    voiceChangeState: VoiceChangeState;
    setVoiceChangeState: React.Dispatch<React.SetStateAction<VoiceChangeState>>;
    isTurboModel: (model: string) => boolean;
    isBaseModel: (model: string) => boolean;
    handleDownloadFile: (e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string) => Promise<void>;
    handleStartVoiceChange: (audioUrl: string, idx: number, title?: string) => Promise<void>;
    handleNewVocalsUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleConvertAndMerge: () => Promise<void>;
    handleExtractLyrics: () => Promise<void>;
    handleModelChange: (newModel: string) => void;
    handleTaskTypeChange: (nextType: string) => void;
    handleCoverAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleCoverAudioDrop: (e: React.DragEvent) => void;
    clearCoverAudio: () => void;
    handleReferenceAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleReferenceAudioDrop: (e: React.DragEvent) => void;
    clearReferenceAudio: () => void;
    handleGenerate: () => Promise<void>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleDragOver: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => void;
    clearImage: () => void;
    handleAnalyzeImage: () => Promise<void>;
    isDownloading: boolean;
    onCancelVoiceChange: () => void;
}

import { apiClient } from './client';
import { SunoResponse, GenerationMode, SearchEngine } from '../types';

export const geminiApi = {
    uploadImage: async (file: File): Promise<{ status: string; path: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.upload('/gemini/upload-image', formData);
    },

    generateSunoPrompt: async (params: {
        text: string;
        youtube_url: string;
        image_path?: string;
        mode: GenerationMode;
        options: { searchEngine: SearchEngine; modelName: string; lyricsLanguage?: string; enableVideoAnalysis?: boolean };
        theme: string;
    }): Promise<SunoResponse> => {
        return apiClient.post('/gemini/generate-suno-prompt', params);
    },

    structureLyrics: async (params: {
        lyrics: string;
        language?: string;
        model_name?: string;
    }): Promise<{ lyrics: string }> => {
        return apiClient.post('/gemini/structure-lyrics', params);
    },

    analyzeUrl: async (url: string): Promise<any> => {
        return apiClient.post('/gemini/analyze-url', { url });
    },

    generateFromSelectedTitle: async (params: {
        selected_title: string;
        original_analysis: string;
        style_candidates: string[];
        options: { modelName: string; lyricsLanguage?: string };
    }): Promise<any> => {
        return apiClient.post('/gemini/generate-from-selected-title', params);
    },

    generateTitle: async (params: {
        lyrics: string;
        theme?: string;
        prompt?: string;
        model_name?: string;
    }): Promise<{ title: string }> => {
        return apiClient.post('/gemini/generate-title', params);
    },

    generateStyleFromLyrics: async (params: {
        lyrics: string;
        url?: string;
        theme?: string;
        language?: string;
        model_name?: string;
    }): Promise<{ style: string }> => {
        return apiClient.post('/gemini/generate-style-from-lyrics', params);
    }
};

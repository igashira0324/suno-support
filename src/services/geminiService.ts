import { SunoResponse, GenerationMode, SearchEngine } from "../types";
import { geminiApi } from "../api/geminiApi";
import { aceStepApi } from "../features/acestep/api/aceStepApi";

export const generateSunoPrompt = async (
    text: string,
    youtubeUrl: string,
    file: File | null,
    mode: GenerationMode = GenerationMode.AUTO,
    options: { searchEngine: SearchEngine; modelName: string; enableVideoAnalysis?: boolean; lyricsLanguage?: string } = { searchEngine: 'google-grounding', modelName: 'gemini-3-flash-preview', enableVideoAnalysis: false, lyricsLanguage: 'Japanese' },
    theme: string = ""
): Promise<SunoResponse> => {
    try {
        let imagePath: string | undefined = undefined;
        if (file) {
            const uploadRes = await geminiApi.uploadImage(file);
            imagePath = uploadRes.path;
        }

        return await geminiApi.generateSunoPrompt({
            text,
            youtube_url: youtubeUrl,
            image_path: imagePath,
            mode,
            options,
            theme
        });
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};

export const generateFromSelectedTitle = async (
    selectedTitle: string,
    originalAnalysis: string,
    styleCandidates: string[],
    options: { modelName: string; lyricsLanguage?: string } = { modelName: 'gemini-3-flash-preview', lyricsLanguage: 'Japanese' }
): Promise<{ bestSelection: any; alternativeSelection: any; tokenUsage?: any }> => {
    try {
        return await geminiApi.generateFromSelectedTitle({
            selected_title: selectedTitle,
            original_analysis: originalAnalysis,
            style_candidates: styleCandidates,
            options
        });
    } catch (error: any) {
        console.error("Gemini API Error (Phase 2):", error);
        throw error;
    }
};

export const generateTitle = async (
    lyrics: string,
    theme: string,
    prompt: string,
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const res = await geminiApi.generateTitle({
            lyrics,
            theme,
            prompt,
            model_name: modelName
        });
        return res.title;
    } catch (e) {
        console.error("Title generation failed:", e);
        return "Generated Song / 生成された楽曲";
    }
};

export const structureLyrics = async (
    rawLyrics: string,
    songDescription: string,
    theme: string,
    language: string = 'ja',
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const res = await geminiApi.structureLyrics({
            lyrics: rawLyrics,
            language,
            model_name: modelName
        });
        return res.lyrics;
    } catch (e) {
        console.error("[structureLyrics] Unexpected error:", e);
        return rawLyrics; 
    }
};

export const generateStyleFromLyrics = async (
    lyrics: string,
    url: string = '',
    theme: string = '',
    language: string = 'ja',
    model_name: string = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const res = await geminiApi.generateStyleFromLyrics({
            lyrics,
            url,
            theme,
            language,
            model_name
        });
        return res.style;
    } catch (e) {
        console.error("Style generation failed:", e);
        return "";
    }
};

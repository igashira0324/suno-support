import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { MediaType, GenerationMode } from '../../../types';
import { ConceptInput } from './sub/ConceptInput';
import { UrlInput } from './sub/UrlInput';
import { MediaUpload } from './sub/MediaUpload';
import { InputSettingsPanel } from './sub/InputSettingsPanel';
import { SubmitButton } from './sub/SubmitButton';

interface InputSectionProps {
    inputText: string;
    youtubeUrl: string;
    onTextChange: (text: string) => void;
    onUrlChange: (url: string) => void;
    onFileSelect: (file: File | null, type: MediaType) => void;
    onSubmit: () => void;
    isLoading: boolean;
    mediaType: MediaType;
    mediaFile: File | null;
    generationMode: GenerationMode;
    onModeChange: (mode: GenerationMode) => void;
    searchEngine: string;
    onSearchEngineChange: (engine: string) => void;
    modelName: string;
    onModelChange: (model: string) => void;
    enableVideoAnalysis: boolean;
    onVideoAnalysisToggle: (enabled: boolean) => void;
    lyricsLanguage: string;
    onLyricsLanguageChange: (language: string) => void;
}

const OEMBED_PATTERNS = [
    /youtube\.com/, /youtu\.be/,
    /open\.spotify\.com/,
    /soundcloud\.com/,
    /tiktok\.com/,
    /vimeo\.com/,
    /twitter\.com/, /x\.com/,
    /instagram\.com/,
    /suno\.com/, /suno\.ai/
];

const InputSection: React.FC<InputSectionProps> = ({
    inputText,
    youtubeUrl,
    onTextChange,
    onUrlChange,
    onFileSelect,
    onSubmit,
    isLoading,
    mediaType,
    mediaFile,
    generationMode,
    onModeChange,
    searchEngine,
    onSearchEngineChange,
    modelName,
    onModelChange,
    enableVideoAnalysis,
    onVideoAnalysisToggle,
    lyricsLanguage,
    onLyricsLanguageChange,
}) => {
    const [searchEnabled, setSearchEnabled] = useState(searchEngine !== 'none');

    // oEmbed対応URLが入力されたら自動的に検索エンジンをOFFにする
    useEffect(() => {
        if (youtubeUrl && youtubeUrl.length > 5) {
            const isOembedSupported = OEMBED_PATTERNS.some(p => p.test(youtubeUrl));
            if (isOembedSupported && searchEnabled) {
                setSearchEnabled(false);
                onSearchEngineChange('none');
            }
        }
    }, [youtubeUrl]);

    const handleSearchToggle = (enabled: boolean) => {
        setSearchEnabled(enabled);
        if (!enabled) {
            onSearchEngineChange('none');
        } else {
            onSearchEngineChange('google-grounding');
        }
    };

    const isSubmitDisabled = !inputText && !youtubeUrl && !mediaFile;

    return (
        <div className="w-full max-w-5xl mx-auto bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <Music className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">楽曲イメージ入力</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="space-y-3">
                    <ConceptInput value={inputText} onChange={onTextChange} />
                    <UrlInput value={youtubeUrl} onChange={onUrlChange} searchEnabled={searchEnabled} />
                    <MediaUpload mediaType={mediaType} mediaFile={mediaFile} onFileSelect={onFileSelect} />
                </div>

                <InputSettingsPanel
                    generationMode={generationMode}
                    onModeChange={onModeChange}
                    modelName={modelName}
                    onModelChange={onModelChange}
                    searchEnabled={searchEnabled}
                    onSearchToggle={handleSearchToggle}
                    searchEngine={searchEngine}
                    onSearchEngineChange={onSearchEngineChange}
                    enableVideoAnalysis={enableVideoAnalysis}
                    onVideoAnalysisToggle={onVideoAnalysisToggle}
                    lyricsLanguage={lyricsLanguage}
                    onLyricsLanguageChange={onLyricsLanguageChange}
                />
            </div>

            <SubmitButton onClick={onSubmit} isLoading={isLoading} disabled={isSubmitDisabled} />
        </div>
    );
};

export default InputSection;

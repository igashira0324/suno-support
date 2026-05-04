import React from 'react';
import { Sparkles, Mic2, MicOff, Search, SearchX, Video } from 'lucide-react';
import { GenerationMode } from '../../../../types';

interface InputSettingsPanelProps {
    generationMode: GenerationMode;
    onModeChange: (mode: GenerationMode) => void;
    modelName: string;
    onModelChange: (model: string) => void;
    searchEnabled: boolean;
    onSearchToggle: (enabled: boolean) => void;
    searchEngine: string;
    onSearchEngineChange: (engine: string) => void;
    enableVideoAnalysis: boolean;
    onVideoAnalysisToggle: (enabled: boolean) => void;
    lyricsLanguage: string;
    onLyricsLanguageChange: (language: string) => void;
}

export const InputSettingsPanel: React.FC<InputSettingsPanelProps> = ({
    generationMode,
    onModeChange,
    modelName,
    onModelChange,
    searchEnabled,
    onSearchToggle,
    searchEngine,
    onSearchEngineChange,
    enableVideoAnalysis,
    onVideoAnalysisToggle,
    lyricsLanguage,
    onLyricsLanguageChange,
}) => {
    const modeOptions = [
        { value: GenerationMode.AUTO, label: '自動', icon: Sparkles },
        { value: GenerationMode.VOCAL, label: '歌あり', icon: Mic2 },
        { value: GenerationMode.INSTRUMENTAL, label: '歌なし', icon: MicOff },
    ];

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-base font-medium text-slate-300 mb-2">生成モード</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {modeOptions.map((option) => {
                        const Icon = option.icon;
                        const isSelected = generationMode === option.value;
                        return (
                            <button
                                key={option.value}
                                onClick={() => onModeChange(option.value)}
                                className={`flex items-center justify-center gap-1.5 py-2.5 rounded text-sm font-medium transition-all ${isSelected ? 'bg-slate-800 text-indigo-300 shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
                            >
                                <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : ''}`} />
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-base font-medium text-slate-300 mb-2">AIモデル</label>
                    <select
                        value={modelName}
                        onChange={(e) => onModelChange(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (推奨・高速・高性能)</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (高精度・高コスト)</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (安定版フォールバック)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (安定版・高精度)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-base font-medium text-slate-300 mb-2">検索エンジン</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onSearchToggle(!searchEnabled)}
                            className={`p-3 rounded-lg border transition-all ${searchEnabled ? 'bg-indigo-950/30 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                        >
                            {searchEnabled ? <Search className="w-6 h-6" /> : <SearchX className="w-6 h-6" />}
                        </button>
                        {searchEnabled ? (
                            <select
                                value={searchEngine}
                                onChange={(e) => onSearchEngineChange(e.target.value)}
                                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="google-grounding">Google Grounding (内蔵)</option>
                                <option value="google-custom">Google Custom Search</option>
                                <option value="tavily">Tavily AI Search</option>
                            </select>
                        ) : (
                            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-500 flex items-center">
                                OFF (節約)
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-base font-medium text-slate-300 mb-2">動画解析</label>
                <button
                    onClick={() => onVideoAnalysisToggle(!enableVideoAnalysis)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${enableVideoAnalysis ? 'bg-violet-950/30 border-violet-500/50 text-violet-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                >
                    <div className="flex items-center gap-3">
                        <Video className={`w-6 h-6 ${enableVideoAnalysis ? 'text-violet-400' : 'text-slate-600'}`} />
                        <span className="text-base font-medium">{enableVideoAnalysis ? 'ON' : 'OFF'}</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${enableVideoAnalysis ? 'bg-violet-600' : 'bg-slate-800'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enableVideoAnalysis ? 'left-5' : 'left-0.5'}`} />
                    </div>
                </button>
            </div>

            <div>
                <label className="block text-base font-medium text-slate-300 mb-2">歌詞の言語</label>
                <select
                    value={lyricsLanguage}
                    onChange={(e) => onLyricsLanguageChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    <option value="Japanese">日本語（一部英語混じりOK）</option>
                    <option value="English">すべて英語</option>
                </select>
            </div>
        </div>
    );
};

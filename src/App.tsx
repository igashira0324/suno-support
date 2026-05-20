import React, { useEffect, useMemo, useState } from 'react';
import { SunoResponse, AppState, MediaType, GenerationMode } from './types';
import { generateSunoPrompt } from './services/geminiService';
import { API_BASE_URL } from '@/config/api';
import InputSection from './components/InputSection';
import ResultSection from './components/ResultSection';
import YuEGenerationTab from './components/YuEGenerationTab';
import AceStepTab from './components/AceStepTab';
import MvProductionTab from './components/MvProductionTab';
import { AudioWaveform as Waveform, Sparkles, AlertCircle, Wand2, Music, Video } from 'lucide-react';

type PromptLoadingPhase = 'phase1' | 'phase2' | null;

const getProgressFromElapsed = (elapsedMs: number): number => {
    const elapsed = elapsedMs / 1000;

    if (elapsed < 6) return Math.round(8 + (elapsed / 6) * 20);
    if (elapsed < 18) return Math.round(28 + ((elapsed - 6) / 12) * 24);
    if (elapsed < 40) return Math.round(52 + ((elapsed - 18) / 22) * 24);
    if (elapsed < 65) return Math.round(76 + ((elapsed - 40) / 25) * 14);
    if (elapsed < 90) return Math.round(90 + ((elapsed - 65) / 25) * 5);

    return 95;
};

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'prompt' | 'yue' | 'ace' | 'mv'>('ace');
    const [promptLoadingPhase, setPromptLoadingPhase] = useState<PromptLoadingPhase>(null);
    const [promptLoadingProgress, setPromptLoadingProgress] = useState(0);
    const [promptLoadingElapsed, setPromptLoadingElapsed] = useState(0);
    const [phase2Title, setPhase2Title] = useState('');
    const [state, setState] = useState<AppState>({
        inputText: '',
        youtubeUrl: '',
        mediaFile: null,
        mediaType: MediaType.NONE,
        generationMode: GenerationMode.VOCAL,
        isLoading: false,
        result: null,
        error: null,
        searchEngine: 'google-grounding',
        modelName: 'gemini-3.5-flash',
        enableVideoAnalysis: false,
        lyricsLanguage: 'Japanese',
    });

    useEffect(() => {
        if (!promptLoadingPhase) {
            setPromptLoadingProgress(0);
            setPromptLoadingElapsed(0);
            return;
        }

        const startedAt = Date.now();
        setPromptLoadingProgress(6);
        setPromptLoadingElapsed(0);

        const interval = window.setInterval(() => {
            const elapsedMs = Date.now() - startedAt;
            setPromptLoadingElapsed(Math.floor(elapsedMs / 1000));
            setPromptLoadingProgress(getProgressFromElapsed(elapsedMs));
        }, 400);

        return () => window.clearInterval(interval);
    }, [promptLoadingPhase]);

    const loadingMessage = useMemo(() => {
        if (promptLoadingPhase === 'phase2') {
            return phase2Title ? `「${phase2Title}」を生成中...` : '歌詞・構成を生成中...';
        }
        return '分析中...';
    }, [phase2Title, promptLoadingPhase]);

    const handleTextChange = (text: string) => setState(prev => ({ ...prev, inputText: text }));
    const handleUrlChange = (url: string) => setState(prev => ({ ...prev, youtubeUrl: url }));
    const handleSearchEngineChange = (engine: any) => setState(prev => ({ ...prev, searchEngine: engine }));
    const handleModelChange = (model: any) => setState(prev => ({ ...prev, modelName: model }));
    const handleVideoAnalysisToggle = (enabled: boolean) => setState(prev => ({ ...prev, enableVideoAnalysis: enabled }));
    const handleLyricsLanguageChange = (language: any) => setState(prev => ({ ...prev, lyricsLanguage: language }));
    const handleFileSelect = (file: File | null, type: MediaType) => setState(prev => ({ ...prev, mediaFile: file, mediaType: type, error: null }));
    const handleModeChange = (mode: GenerationMode) => setState(prev => ({ ...prev, generationMode: mode }));

    const handleSubmit = async () => {
        if (!state.inputText && !state.youtubeUrl && !state.mediaFile) return;
        setPromptLoadingPhase('phase1');
        setState(prev => ({ ...prev, isLoading: true, error: null, result: null }));
        try {
            const result = await generateSunoPrompt(
                state.inputText,
                state.youtubeUrl,
                state.mediaFile,
                state.generationMode,
                { searchEngine: state.searchEngine, modelName: state.modelName, enableVideoAnalysis: state.enableVideoAnalysis, lyricsLanguage: state.lyricsLanguage }
            );
            // Phase 1: Clear bestSelection/alternativeSelection to show title selection UI
            const phase1Result = {
                ...result,
                bestSelection: { title: '', style: '', instrumental: false, content: '', comment: '' },
                alternativeSelection: { title: '', style: '', instrumental: false, content: '', comment: '' },
            };
            setPromptLoadingProgress(100);
            setState(prev => ({ ...prev, isLoading: false, result: phase1Result }));
        } catch (error: any) {
            setPromptLoadingProgress(100);
            setState(prev => ({ ...prev, isLoading: false, error: error.message || "予期せぬエラーが発生しました。" }));
        } finally {
            window.setTimeout(() => {
                setPromptLoadingPhase(null);
            }, 400);
        }
    };

    const [isGeneratingPhase2, setIsGeneratingPhase2] = useState(false);

    const handleTitleSelect = async (selectedTitle: string) => {
        if (!state.result) return;
        // Skip if already generated
        if (state.result.generatedTitles?.includes(selectedTitle)) return;

        setIsGeneratingPhase2(true);
        setPhase2Title(selectedTitle);
        setPromptLoadingPhase('phase2');
        try {
            const { generateFromSelectedTitle } = await import('./services/geminiService');
            const phase2Result = await generateFromSelectedTitle(
                selectedTitle,
                state.result.analysis,
                state.result.styleCandidates,
                { modelName: state.modelName, lyricsLanguage: state.lyricsLanguage }
            );

            // Append to generatedSelections array
            const newSelection = {
                ...phase2Result.bestSelection,
                title: selectedTitle,
                tokenUsage: phase2Result.tokenUsage,
            };

            setState(prev => ({
                ...prev,
                result: prev.result ? {
                    ...prev.result,
                    generatedSelections: [...(prev.result.generatedSelections || []), newSelection],
                    generatedTitles: [...(prev.result.generatedTitles || []), selectedTitle],
                } : null,
            }));
        } catch (error: any) {
            setState(prev => ({ ...prev, error: error.message || "生成でエラーが発生しました。" }));
        } finally {
            setPromptLoadingProgress(100);
            setIsGeneratingPhase2(false);
            window.setTimeout(() => {
                setPromptLoadingPhase(null);
                setPhase2Title('');
            }, 400);
        }
    };

    const handleMinimaxGenerate = async (title: string, style: string, content: string, index: number) => {
        if (!state.result || !state.result.generatedSelections) return;

        // Update state to show loading for specific card
        const updatedSelections = [...state.result.generatedSelections];
        updatedSelections[index] = {
            ...updatedSelections[index],
            isMinimaxGenerating: true,
            minimaxError: null
        };
        setState(prev => ({
            ...prev,
            result: prev.result ? { ...prev.result, generatedSelections: updatedSelections } : null
        }));

        try {
            const response = await fetch(`${API_BASE_URL}/acestep/minimax/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lyrics: content, prompt: style })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'MiniMax生成に失敗しました。');
            }

            // Update state with result
            const finalSelections = [...(state.result?.generatedSelections || [])];
            finalSelections[index] = {
                ...finalSelections[index],
                isMinimaxGenerating: false,
                minimaxAudioUrl: `${API_BASE_URL}${data.audio_url}`,
                minimaxError: null
            };

            setState(prev => ({
                ...prev,
                result: prev.result ? { ...prev.result, generatedSelections: finalSelections } : null
            }));

        } catch (error: any) {
            console.error("MiniMax Error:", error);
            const errorSelections = [...(state.result?.generatedSelections || [])];
            errorSelections[index] = {
                ...errorSelections[index],
                isMinimaxGenerating: false,
                minimaxError: error.message
            };
            setState(prev => ({
                ...prev,
                result: prev.result ? { ...prev.result, generatedSelections: errorSelections } : null
            }));
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-slate-200">

            {/* Header */}
            <header className="border-b border-white/5 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="relative">
                            <Waveform className="w-8 h-8 text-indigo-500" />
                            <div className="absolute inset-0 blur-sm bg-indigo-500/50 animate-pulse" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight text-white">
                            Suno<span className="text-indigo-400">Architect</span>
                        </h1>
                    </div>

                    <nav className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-white/5">
                        <button
                            onClick={() => setActiveTab('prompt')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'prompt'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            <Wand2 className="w-4 h-4" />
                            Prompt Gen
                        </button>
                        <button
                            onClick={() => setActiveTab('yue')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'yue'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            <Music className="w-4 h-4" />
                            YuE Generate
                        </button>
                        <button
                            onClick={() => setActiveTab('ace')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ace'
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            <Sparkles className="w-4 h-4" />
                            ACE-Step 1.5
                        </button>
                        <button
                            onClick={() => setActiveTab('mv')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'mv'
                                ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                        >
                            <Video className="w-4 h-4" />
                            MV Support
                        </button>
                    </nav>

                    <div className="hidden md:flex items-center gap-4">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black bg-slate-900 px-2 py-1 rounded border border-white/5">v4.7 Hybrid</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow w-full max-w-7xl mx-auto px-4 py-8 overflow-hidden flex flex-col">
                <div style={{ display: activeTab === 'prompt' ? 'block' : 'none' }}
                    className="space-y-12 overflow-y-auto custom-scrollbar pr-2">
                    <InputSection
                        inputText={state.inputText}
                        youtubeUrl={state.youtubeUrl}
                        onTextChange={handleTextChange}
                        onUrlChange={handleUrlChange}
                        onFileSelect={handleFileSelect}
                        onSubmit={handleSubmit}
                        isLoading={state.isLoading}
                        mediaType={state.mediaType}
                        mediaFile={state.mediaFile}
                        generationMode={state.generationMode}
                        onModeChange={handleModeChange}
                        searchEngine={state.searchEngine}
                        onSearchEngineChange={handleSearchEngineChange}
                        modelName={state.modelName}
                        onModelChange={handleModelChange}
                        enableVideoAnalysis={state.enableVideoAnalysis}
                        onVideoAnalysisToggle={handleVideoAnalysisToggle}
                        lyricsLanguage={state.lyricsLanguage}
                        onLyricsLanguageChange={handleLyricsLanguageChange}
                        loadingProgress={promptLoadingProgress}
                        loadingMessage={loadingMessage}
                    />

                    {state.error && (
                        <div className="max-w-2xl mx-auto p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 flex items-start gap-3 shadow-lg">
                            <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                            <div><h3 className="font-bold text-red-300 mb-1">生成エラー</h3><p className="text-sm text-red-200/80">{state.error}</p></div>
                        </div>
                    )}

                    {state.result && (
                        <ResultSection
                            data={state.result}
                            onTitleSelect={handleTitleSelect}
                            isGeneratingPhase2={isGeneratingPhase2}
                            onMinimaxGenerate={handleMinimaxGenerate}
                            phase2Progress={promptLoadingPhase === 'phase2' ? promptLoadingProgress : 0}
                            phase2Message={loadingMessage}
                        />
                    )}
                </div>
                <div style={{ display: activeTab === 'yue' ? 'block' : 'none' }}>
                    <YuEGenerationTab />
                </div>
                <div style={{ display: activeTab === 'ace' ? 'block' : 'none' }}>
                    <AceStepTab />
                </div>
                <div style={{ display: activeTab === 'mv' ? 'block' : 'none' }}>
                    <MvProductionTab />
                </div>
            </main>

            {promptLoadingPhase && (
                <div className="fixed right-6 bottom-6 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-xl shadow-2xl shadow-black/40">
                    <div className="p-5">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="mt-0.5 h-10 w-10 rounded-full bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center shrink-0">
                                <Sparkles className="w-5 h-5 text-indigo-300 animate-pulse" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-white font-semibold">{loadingMessage}</p>
                                <p className="text-slate-400 text-sm mt-1">
                                    {promptLoadingPhase === 'phase1'
                                        ? 'タイトル候補とスタイル候補を解析しています。'
                                        : '歌詞、構成、説明コメント、MV 用タイムラインをまとめています。'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-2">
                            <span>{promptLoadingElapsed}秒経過</span>
                            <span>{promptLoadingProgress}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${promptLoadingPhase === 'phase1'
                                    ? 'bg-gradient-to-r from-indigo-400 via-sky-400 to-cyan-300'
                                    : 'bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400'}`}
                                style={{ width: `${promptLoadingProgress}%` }}
                            />
                        </div>
                        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            通常は 40〜90 秒程度です
                        </p>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="border-t border-white/5 py-4 bg-black/20">
                <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-slate-600 text-[10px] uppercase tracking-widest font-bold">
                    <p className="flex items-center gap-2"><Sparkles className="w-3 h-3" /> Powered by Gemini & YuE-s1</p>
                    <p>© 2026 Suno Architect Suite</p>
                </div>
            </footer>
        </div>
    );
};

export default App;

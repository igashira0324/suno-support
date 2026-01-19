import React, { useState } from 'react';
import { SunoResponse, AppState, MediaType, GenerationMode } from './types';
import { generateSunoPrompt } from './services/geminiService';
import InputSection from './components/InputSection';
import ResultSection from './components/ResultSection';
import YuEGenerationTab from './components/YuEGenerationTab';
import MvProductionTab from './components/MvProductionTab';
import { AudioWaveform as Waveform, Sparkles, AlertCircle, Wand2, Music, Settings, Info, Video } from 'lucide-react';

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'prompt' | 'yue' | 'mv'>('prompt');
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
        modelName: 'gemini-3-flash-preview',
        enableVideoAnalysis: false,
    });

    const handleTextChange = (text: string) => setState(prev => ({ ...prev, inputText: text }));
    const handleUrlChange = (url: string) => setState(prev => ({ ...prev, youtubeUrl: url }));
    const handleSearchEngineChange = (engine: any) => setState(prev => ({ ...prev, searchEngine: engine }));
    const handleModelChange = (model: any) => setState(prev => ({ ...prev, modelName: model }));
    const handleVideoAnalysisToggle = (enabled: boolean) => setState(prev => ({ ...prev, enableVideoAnalysis: enabled }));
    const handleFileSelect = (file: File | null, type: MediaType) => setState(prev => ({ ...prev, mediaFile: file, mediaType: type, error: null }));
    const handleModeChange = (mode: GenerationMode) => setState(prev => ({ ...prev, generationMode: mode }));

    const handleSubmit = async () => {
        if (!state.inputText && !state.youtubeUrl && !state.mediaFile) return;
        setState(prev => ({ ...prev, isLoading: true, error: null, result: null }));
        try {
            const result = await generateSunoPrompt(
                state.inputText,
                state.youtubeUrl,
                state.mediaFile,
                state.generationMode,
                { searchEngine: state.searchEngine, modelName: state.modelName, enableVideoAnalysis: state.enableVideoAnalysis }
            );
            // Phase 1: Clear bestSelection/alternativeSelection to show title selection UI
            const phase1Result = {
                ...result,
                bestSelection: { title: '', style: '', instrumental: false, content: '', comment: '' },
                alternativeSelection: { title: '', style: '', instrumental: false, content: '', comment: '' },
            };
            setState(prev => ({ ...prev, isLoading: false, result: phase1Result }));
        } catch (error: any) {
            setState(prev => ({ ...prev, isLoading: false, error: error.message || "予期せぬエラーが発生しました。" }));
        }
    };

    const [isGeneratingPhase2, setIsGeneratingPhase2] = useState(false);

    const handleTitleSelect = async (selectedTitle: string) => {
        if (!state.result) return;
        // Skip if already generated
        if (state.result.generatedTitles?.includes(selectedTitle)) return;

        setIsGeneratingPhase2(true);
        try {
            const { generateFromSelectedTitle } = await import('./services/geminiService');
            const phase2Result = await generateFromSelectedTitle(
                selectedTitle,
                state.result.analysis,
                state.result.styleCandidates,
                { modelName: state.modelName }
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
            setIsGeneratingPhase2(false);
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
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black bg-slate-900 px-2 py-1 rounded border border-white/5">v4.5 Hybrid</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow w-full max-w-7xl mx-auto px-4 py-8 overflow-hidden flex flex-col">
                {activeTab === 'prompt' ? (
                    <div className="space-y-12 overflow-y-auto custom-scrollbar pr-2">
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
                        />

                        {state.error && (
                            <div className="max-w-2xl mx-auto p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 flex items-start gap-3 shadow-lg">
                                <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                                <div><h3 className="font-bold text-red-300 mb-1">生成エラー</h3><p className="text-sm text-red-200/80">{state.error}</p></div>
                            </div>
                        )}

                        {state.result && <ResultSection data={state.result} onTitleSelect={handleTitleSelect} isGeneratingPhase2={isGeneratingPhase2} />}
                    </div>
                ) : activeTab === 'yue' ? (
                    <YuEGenerationTab />
                ) : (
                    <MvProductionTab />
                )}
            </main>

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

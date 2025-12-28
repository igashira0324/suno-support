import React, { useState } from 'react';
import { SunoResponse, AppState, MediaType, GenerationMode } from './types';
import { generateSunoPrompt } from './services/geminiService';
import InputSection from './components/InputSection';
import ResultSection from './components/ResultSection';
import { AudioWaveform as Waveform, Sparkles, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    inputText: '',
    mediaFile: null,
    mediaType: MediaType.NONE,
    generationMode: GenerationMode.VOCAL,
    isLoading: false,
    result: null,
    error: null,
    searchEngine: 'none',
    modelName: 'gemini-3-flash-preview',
    enableVideoAnalysis: false,
  });

  const handleTextChange = (text: string) => {
    setState(prev => ({ ...prev, inputText: text }));
  };

  const handleSearchEngineChange = (engine: any) => {
    setState(prev => ({ ...prev, searchEngine: engine }));
  };

  const handleModelChange = (model: any) => {
    setState(prev => ({ ...prev, modelName: model }));
  };

  const handleVideoAnalysisToggle = (enabled: boolean) => {
    setState(prev => ({ ...prev, enableVideoAnalysis: enabled }));
  };

  const handleFileSelect = (file: File | null, type: MediaType) => {
    setState(prev => ({
      ...prev,
      mediaFile: file,
      mediaType: type,
      // Clear previous result if inputs change to encourage regeneration
      error: null
    }));
  };

  const handleModeChange = (mode: GenerationMode) => {
    setState(prev => ({ ...prev, generationMode: mode }));
  };

  const handleSubmit = async () => {
    if (!state.inputText && !state.mediaFile) return;

    setState(prev => ({ ...prev, isLoading: true, error: null, result: null }));

    try {
      const result = await generateSunoPrompt(
        state.inputText,
        state.mediaFile,
        state.generationMode,
        { searchEngine: state.searchEngine, modelName: state.modelName, enableVideoAnalysis: state.enableVideoAnalysis }
      );
      setState(prev => ({ ...prev, isLoading: false, result }));
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "予期せぬエラーが発生しました。";
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black">

      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Waveform className="w-8 h-8 text-indigo-500" />
              <div className="absolute inset-0 blur-sm bg-indigo-500/50 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Suno<span className="text-indigo-400">Architect</span> <span className="text-xs font-normal text-slate-500 ml-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">v4.5</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-xs text-slate-500 uppercase tracking-widest font-semibold">AI Music Production Assistant</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Hero section removed per user request */}

        <div className="space-y-16">
          <InputSection
            inputText={state.inputText}
            onTextChange={handleTextChange}
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
            <div className="max-w-2xl mx-auto p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 shadow-lg shadow-red-900/10">
              <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-red-300 mb-1">生成エラー</h3>
                <p className="text-sm text-red-200/80">{state.error}</p>
              </div>
            </div>
          )}

          {state.result && <ResultSection data={state.result} />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 text-sm">
          <p className="flex items-center justify-center gap-2">
            <Sparkles className="w-3 h-3" />
            Powered by Google Gemini & Suno Architect Logic
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
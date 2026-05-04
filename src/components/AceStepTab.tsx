import React from 'react';
import { AlertCircle, History, Sparkles, Music2 } from 'lucide-react';
import { useAceStep } from '../features/acestep/hooks/useAceStep';
import { ImageSection } from '../features/acestep/components/ImageSection';
import { LyricsSection } from '../features/acestep/components/LyricsSection';
import { SettingsSection } from '../features/acestep/components/SettingsSection';
import { ResultCard } from '../features/acestep/components/ResultCard';
import { VoiceChangeDialog } from '../features/acestep/components/VoiceChangeDialog';

const AceStepTab: React.FC = () => {
    const {
        state,
        setState,
        visualProgress,
        voiceChange,
        setVoiceChange,
        handleGenerate,
        handleStartVoiceChange,
        handleConvertAndMerge,
        handleExtractLyrics,
        handleDownloadFile,
        handleAnalyzeImage,
        isDownloading
    } = useAceStep();

    const resultsRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll to results when new files are added
    React.useEffect(() => {
        if (state.output_files.length > 0 && !state.isGenerating) {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [state.output_files.length, state.isGenerating]);

    return (
        <div className="relative min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-pink-600/10 rounded-full blur-[150px] pointer-events-none"></div>

            <div className="relative max-w-[1400px] mx-auto px-6 py-8 space-y-8">
                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-4 border-b border-white/5">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-2">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">ACE-Step v1.5 Engine</span>
                            </div>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-500">
                            Music Architect
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 border border-white/5 text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all">
                            <History className="w-4 h-4" /> History
                        </button>
                    </div>
                </header>

                {/* Error Display */}
                {state.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-400 animate-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-xs font-bold uppercase tracking-wider">{state.error}</p>
                    </div>
                )}

                {/* Main Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
                    {/* Left Column */}
                    <main className="space-y-6 min-w-0">
                        <div ref={resultsRef} />
                        
                        {/* Results first after generation */}
                        {state.output_files.length > 0 && (
                            <section className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                            <Sparkles className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-black text-white uppercase tracking-widest">
                                                Generated Tracks
                                            </h2>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                {state.output_files.length} audio file{state.output_files.length > 1 ? 's' : ''} available
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {state.output_files.map((file, idx) => (
                                        <ResultCard
                                            key={`${file.url}-${idx}`}
                                            file={file}
                                            index={idx}
                                            generatedTitle={state.generatedTitle}
                                            onDownload={handleDownloadFile}
                                            onStartVoiceChange={handleStartVoiceChange}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Editor */}
                        <LyricsSection state={state} setState={setState} />
                    </main>

                    {/* Right Column */}
                    <aside className="space-y-6 xl:sticky xl:top-24">
                        <SettingsSection
                            state={state}
                            setState={setState}
                            onGenerate={handleGenerate}
                            visualProgress={visualProgress}
                        />

                        <ImageSection
                            state={state}
                            setState={setState}
                            onAnalyze={handleAnalyzeImage}
                        />
                    </aside>
                </div>

            </div>

            {/* Voice Change Dialog */}
            {voiceChange.activeIndex !== null && (
                <VoiceChangeDialog
                    voiceChange={voiceChange}
                    setVoiceChange={setVoiceChange}
                    onClose={() => setVoiceChange(prev => ({ ...prev, activeIndex: null }))}
                    onConvert={handleConvertAndMerge}
                    onDownload={handleDownloadFile}
                />
            )}
        </div>
    );
};

export default AceStepTab;

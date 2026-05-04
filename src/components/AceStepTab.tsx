import React from 'react';
import { AlertCircle, History, Sparkles } from 'lucide-react';
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

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Editor */}
                    <div className="lg:col-span-2 space-y-6">
                        <LyricsSection state={state} setState={setState} />
                    </div>

                    {/* Right Column: Controls */}
                    <div className="space-y-6">
                        <ImageSection state={state} setState={setState} onAnalyze={handleAnalyzeImage} />
                        <SettingsSection state={state} setState={setState} onGenerate={handleGenerate} visualProgress={visualProgress} />
                    </div>
                </div>

                {/* Results Section */}
                {state.output_files.length > 0 && (
                    <section className="pt-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-indigo-400" />
                            </div>
                            <h2 className="text-xl font-black text-white uppercase tracking-widest">Acoustic Artifacts</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {state.output_files.map((file, idx) => (
                                <ResultCard
                                    key={idx}
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

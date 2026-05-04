import React, { useState, useEffect } from 'react';
import { Scissors, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMvProduction } from './hooks/useMvProduction';
import { useWaveform } from './hooks/useWaveform';
import { FileUploadSection } from './components/FileUploadSection';
import { WaveformDisplay } from './components/WaveformDisplay';
import { AnalysisSection } from './components/AnalysisSection';
import { ClapSearchSection } from './components/ClapSearchSection';
import { VoiceChangeSection } from './components/VoiceChangeSection';
import { mvApi } from './api/mvApi';

const MvProduction: React.FC = () => {
    const {
        state,
        voiceChange,
        setVoiceChange,
        activeTrack,
        setActiveTrack,
        audioAnalysis,
        isAnalyzing,
        clapResults,
        clapPresets,
        isSearching,
        isCancelling,
        handleFileSelect,
        handleUrlImport,
        handleCancel,
        analyzeCurrentTrack,
        handleClapSearch,
        loadClapPresets,
        handleConvertAndMerge
    } = useMvProduction();

    const [volume, setVolume] = useState(1.0);
    const [isLooping, setIsLooping] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState<{ start: number, end: number } | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const {
        waveformRef,
        timelineRef,
        wavesurferRef,
        regionsPluginRef,
        isPlaying,
        duration,
        currentTime,
        zoom,
        wavesurferError,
        handlePlayPause,
        handleZoom
    } = useWaveform(
        state.result,
        activeTrack,
        volume,
        selectedRegion,
        setSelectedRegion,
        isLooping
    );

    const handleDownloadSegment = async () => {
        if (!selectedRegion || !state.result || isDownloading) return;
        setIsDownloading(true);
        try {
            // Get raw relative path from result for the current track
            const trackUrl = activeTrack === 'original' 
                ? state.result.original_path 
                : activeTrack === 'vocals' 
                    ? state.result.vocals_url 
                    : state.result.instrumental_url;
            
            if (!trackUrl) throw new Error('No track path available');

            const blob = await mvApi.trimAudio(trackUrl, selectedRegion.start, selectedRegion.end);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `trim_${activeTrack}_${Math.floor(selectedRegion.start)}-${Math.floor(selectedRegion.end)}.wav`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            alert("Download failed: " + error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadFile = async (e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string) => {
        e.preventDefault();
        setIsDownloading(true);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (error: any) {
            alert("Download failed: " + error.message);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSetStartToCurrent = () => {
        if (!regionsPluginRef.current || !wavesurferRef.current) return;
        const current = wavesurferRef.current.getCurrentTime();
        const end = selectedRegion ? Math.max(current + 0.1, selectedRegion.end) : current + 5;
        regionsPluginRef.current.clearRegions();
        regionsPluginRef.current.addRegion({ start: current, end, color: 'rgba(255, 255, 255, 0.2)' });
    };

    const handleSetEndToCurrent = () => {
        if (!regionsPluginRef.current || !wavesurferRef.current || !selectedRegion) return;
        const current = wavesurferRef.current.getCurrentTime();
        const start = Math.min(current - 0.1, selectedRegion.start);
        regionsPluginRef.current.clearRegions();
        regionsPluginRef.current.addRegion({ start, end: current, color: 'rgba(255, 255, 255, 0.2)' });
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 max-w-[1200px] mx-auto overflow-y-auto custom-scrollbar">
            <div className="bg-slate-900/50 p-8 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                        <Scissors className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">MV Production Support</h2>
                        <p className="text-slate-400 text-sm">Separates vocals and instruments, with precise trimming and multi-track preview.</p>
                    </div>
                </div>

                {state.status === 'idle' && (
                    <FileUploadSection 
                        onFileSelect={handleFileSelect} 
                        onUrlImport={handleUrlImport} 
                    />
                )}

                {(state.status === 'queued' || state.status === 'processing' || state.status === 'downloading' || state.status === 'uploading') && (
                    <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
                        <div className="relative">
                            <div className="w-24 h-24 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-black text-white">{state.progress}%</span>
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-white uppercase tracking-widest">
                                {state.status === 'uploading' ? 'Sending File...' : 
                                 state.status === 'downloading' ? 'Importing from URL...' :
                                 state.status === 'queued' ? 'Waiting in Queue...' : 'AI Processing...'}
                            </h3>
                            <p className="text-slate-500 text-sm font-medium">
                                {state.originalName ? `Processing: ${state.originalName}` : 'Harnessing GPU Acceleration...'}
                            </p>
                        </div>
                        <button 
                            onClick={handleCancel}
                            disabled={isCancelling}
                            className="px-6 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                        >
                            {isCancelling ? 'Cancelling...' : 'Cancel Task'}
                        </button>
                    </div>
                )}

                {state.status === 'failed' && (
                    <div className="py-20 text-center space-y-6 animate-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
                            <AlertCircle className="w-10 h-10 text-rose-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white">Processing Failed</h3>
                            <p className="text-rose-400/70 text-sm max-w-md mx-auto">{state.error}</p>
                        </div>
                        <button 
                            onClick={() => window.location.reload()}
                            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {state.status === 'completed' && state.result && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-lg">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Status</span>
                                    <span className="text-sm font-bold text-white">Separation Complete</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => window.location.reload()}
                                className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-indigo-400 transition-colors"
                            >
                                Process Another File
                            </button>
                        </div>

                        <WaveformDisplay
                            waveformRef={waveformRef}
                            timelineRef={timelineRef}
                            isPlaying={isPlaying}
                            onPlayPause={handlePlayPause}
                            onZoom={handleZoom}
                            volume={volume}
                            onVolumeChange={setVolume}
                            isLooping={isLooping}
                            onToggleLoop={() => setIsLooping(!isLooping)}
                            activeTrack={activeTrack}
                            onTrackChange={setActiveTrack}
                            currentTime={currentTime}
                            duration={duration}
                            wavesurferError={wavesurferError}
                            selectedRegion={selectedRegion}
                            onSetStartToCurrent={handleSetStartToCurrent}
                            onSetEndToCurrent={handleSetEndToCurrent}
                            onDownloadSegment={handleDownloadSegment}
                            isDownloading={isDownloading}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <AnalysisSection
                                analysis={audioAnalysis}
                                isAnalyzing={isAnalyzing}
                                onAnalyze={analyzeCurrentTrack}
                                onSegmentClick={(seg) => {
                                    if (!regionsPluginRef.current) return;
                                    regionsPluginRef.current.clearRegions();
                                    regionsPluginRef.current.addRegion({
                                        start: seg.start,
                                        end: seg.end,
                                        color: 'rgba(255, 255, 255, 0.2)'
                                    });
                                }}
                            />
                            <ClapSearchSection
                                onSearch={handleClapSearch}
                                results={clapResults}
                                presets={clapPresets}
                                isSearching={isSearching}
                                onResultClick={(res) => {
                                    if (!regionsPluginRef.current) return;
                                    regionsPluginRef.current.clearRegions();
                                    regionsPluginRef.current.addRegion({
                                        start: res.start,
                                        end: res.end,
                                        color: 'rgba(99, 102, 241, 0.3)'
                                    });
                                }}
                                onLoadPresets={loadClapPresets}
                            />
                        </div>

                        <VoiceChangeSection
                            voiceChange={voiceChange}
                            onVoiceChangeStateUpdate={(upd) => setVoiceChange(prev => ({ ...prev, ...upd }))}
                            onConvert={handleConvertAndMerge}
                            onDownloadMerged={handleDownloadFile}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MvProduction;

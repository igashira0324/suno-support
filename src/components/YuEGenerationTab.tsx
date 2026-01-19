import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Music, AlertCircle, Loader2, FileAudio } from 'lucide-react';

interface YuEState {
    title: string;
    genre: string;
    lyrics: string;
    segments: number;
    max_new_tokens: number;
    quality: string;
    vocalType: string;
    language: string;
    isGenerating: boolean;
    jobId: string | null;
    status: string;
    progress: number;
    logs: string[];
    output_files: string[];
    error: string | null;
}

const YuEGenerationTab: React.FC = () => {
    const [state, setState] = useState<YuEState>({
        title: "My New Song",
        genre: "guitars, piano, energetic, uplifting, high quality, melodic",
        lyrics: "[intro]\n(Soft piano start, building slowly)\n\n[verse]\nLyrics go here...\n\n[chorus]\nSinging loud and clear!\n\n[outro]\n(Fading strings)",
        segments: 2,
        max_new_tokens: 3000,
        quality: "best",
        vocalType: "female",
        language: "en",
        isGenerating: false,
        jobId: null,
        status: "idle",
        progress: 0,
        logs: [],
        output_files: [],
        error: null
    });

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const handleGenerate = async () => {
        setState(prev => ({ ...prev, isGenerating: true, error: null, logs: [], progress: 0, status: "starting" }));

        const formData = new FormData();
        formData.append("genre_txt", state.genre);
        formData.append("lyrics_txt", state.lyrics);
        formData.append("segments", state.segments.toString());
        formData.append("max_new_tokens", state.max_new_tokens.toString());
        formData.append("quality", state.quality);
        formData.append("title", state.title);
        formData.append("vocal_type", state.vocalType);
        formData.append("language", state.language);

        try {
            const response = await fetch("http://localhost:8000/yue/generate", {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            if (data.status === "success") {
                setState(prev => ({ ...prev, jobId: data.job_id, status: "queued" }));
                startPolling(data.job_id);
            } else {
                throw new Error(data.detail || "Failed to start generation");
            }
        } catch (err: any) {
            setState(prev => ({ ...prev, isGenerating: false, error: err.message }));
        }
    };

    const startPolling = (jobId: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:8000/yue/status/${jobId}`);
                const data = await res.json();

                setState(prev => ({
                    ...prev,
                    status: data.status,
                    progress: data.progress,
                    logs: data.logs.slice(-5),
                    output_files: data.output_files,
                    error: data.error
                }));

                if (data.status === "completed" || data.status === "failed") {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    setState(prev => ({ ...prev, isGenerating: false }));
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 2000);
    };

    const getLyricsPlaceholder = () => {
        if (state.vocalType === 'none') {
            return "[Intro]\n(Melodic piano start)\n\n[Verse]\n(Light drum beat enters)\n\n[Chorus]\n(Full orchestral swell)\n\n[Outro]\n(Fade out)";
        }
        return "[verse]\nType your lyrics here...\n\n[chorus]\n...";
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 max-w-[1200px] mx-auto overflow-y-auto custom-scrollbar">
            <div className="w-full flex flex-col gap-6">
                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800/50 shadow-xl backdrop-blur-sm">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-6 flex items-center gap-2">
                        <Music className="w-5 h-5" />
                        YuE Custom Generation
                    </h2>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Title (for download)</label>
                                <input
                                    type="text"
                                    value={state.title}
                                    onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none font-medium placeholder-slate-600 transition-all text-sm"
                                    placeholder="Enter song title"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Lyrics Language</label>
                                    <select
                                        value={state.language}
                                        onChange={(e) => setState(prev => ({ ...prev, language: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                                    >
                                        <option value="en">English focus (en-cot)</option>
                                        <option value="ja">Japanese focus (jp-kr-cot)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Vocal Type</label>
                                    <select
                                        value={state.vocalType}
                                        onChange={(e) => setState(prev => ({ ...prev, vocalType: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                                    >
                                        <option value="none">None (Instrumental)</option>
                                        <option value="male">Male Vocals</option>
                                        <option value="female">Female Vocals</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Style & Genre Tags</label>
                                <textarea
                                    value={state.genre}
                                    onChange={(e) => setState(prev => ({ ...prev, genre: e.target.value }))}
                                    className="w-full h-32 bg-slate-950/80 border border-slate-700 rounded-xl p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none font-medium placeholder-slate-600 transition-all text-sm"
                                    placeholder="e.g. female vocals, acoustic guitar, bright, pop"
                                />
                                <div className="flex items-start gap-2 text-[11px] text-amber-400/80 bg-amber-400/5 p-2 rounded-lg border border-amber-400/10">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>長い文章は避け、カンマ区切りの短い単語で指定してください。</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Quality Profile</label>
                                    <select
                                        value={state.quality}
                                        onChange={(e) => setState(prev => ({ ...prev, quality: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                                    >
                                        <option value="fast">Fast (4.25bpw)</option>
                                        <option value="balanced">Balanced (6.0bpw)</option>
                                        <option value="best">Best Quality (8.0bpw) ⭐</option>
                                    </select>
                                    {state.quality === "best" && (
                                        <p className="text-[10px] text-amber-500/80 italic">Highly recommended for 16GB+ VRAM users.</p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Segments</label>
                                    <select
                                        value={state.segments}
                                        onChange={(e) => {
                                            const segs = parseInt(e.target.value);
                                            setState(prev => ({ ...prev, segments: segs, max_new_tokens: 3000 }));
                                        }}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none"
                                    >
                                        <option value={1}>1 (Short - ~30s)</option>
                                        <option value={2}>2 (Medium - ~1m)</option>
                                        <option value={3}>3 (Long - ~1m30s)</option>
                                        <option value={4}>4 (Full Song - ~2m+)</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={state.isGenerating}
                                className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] mt-4 ${state.isGenerating
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white hover:shadow-indigo-500/25'
                                    }`}
                            >
                                {state.isGenerating ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Generating Music...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-5 h-5 fill-current" />
                                        Generate
                                    </>
                                )}
                            </button>
                            {state.error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    {state.error}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col h-full">
                            <div className="space-y-2 flex-1 flex flex-col h-full">
                                <label className="text-sm font-medium text-slate-300">Lyrics</label>
                                <textarea
                                    value={state.lyrics}
                                    onChange={(e) => setState(prev => ({ ...prev, lyrics: e.target.value }))}
                                    className="w-full h-full min-h-[500px] bg-slate-950/80 border border-slate-700 rounded-xl p-4 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
                                    placeholder={getLyricsPlaceholder()}
                                />
                                <p className="text-xs text-slate-500">Structure your song with [verse], [chorus].</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full bg-slate-900/30 border-t border-white/5 p-6 rounded-xl">
                <div className="max-w-4xl mx-auto space-y-8">
                    <h3 className="text-2xl font-bold text-slate-200 border-b border-white/10 pb-4">Generation Result</h3>
                    <div className="bg-black/40 rounded-xl p-6 border border-white/10 font-mono text-sm space-y-4 shadow-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className={`uppercase font-bold tracking-wider ${state.status === 'completed' ? 'text-green-400' :
                                state.status === 'failed' ? 'text-red-400' : 'text-blue-400'
                                }`}>STATUS: {state.status}</span>
                            <span className="text-slate-400 font-bold">{state.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden mb-2">
                            <div
                                className={`h-full transition-all duration-500 ${state.status === 'failed' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                                    }`}
                                style={{ width: `${state.progress}%` }}
                            />
                        </div>
                        <div className="bg-slate-950/50 p-4 rounded-lg h-40 overflow-y-auto space-y-1 text-slate-400 custom-scrollbar border border-white/5">
                            {state.logs.length === 0 && <span className="opacity-50 italic">Waiting for start...</span>}
                            {state.logs.map((log, i) => (
                                <div key={i} className="truncate hover:text-slate-300 transition-colors">{log}</div>
                            ))}
                        </div>
                    </div>

                    {state.output_files.length > 0 && (
                        <div className="space-y-6">
                            <h4 className="text-lg font-medium text-slate-300 flex items-center gap-3">
                                <FileAudio className="w-6 h-6 text-green-400" />
                                Generated Tracks
                            </h4>
                            <div className="grid gap-4">
                                {state.output_files.map((file, idx) => (
                                    <div key={idx} className="bg-slate-800/60 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between group hover:bg-slate-800/80 transition-all border border-slate-700 shadow-lg gap-4">
                                        <div className="flex flex-col gap-2 min-w-0 w-full md:w-auto overflow-hidden">
                                            <span className="text-lg font-bold text-slate-200 truncate pr-4">{file}</span>
                                            <span className="text-xs text-slate-500 font-mono bg-slate-900/50 px-2 py-1 rounded w-fit">{state.jobId}</span>
                                        </div>
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <audio controls src={`http://localhost:8000/outputs/yue_generations/${state.jobId}/${file}`} className="h-12 w-full md:w-[400px] shadow-md rounded-full" />
                                            <a
                                                href={`http://localhost:8000/outputs/yue_generations/${state.jobId}/${file}`}
                                                download={file}
                                                className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition-colors shadow-lg shadow-indigo-500/30"
                                                title={`Download ${file}`}
                                            >
                                                <Download className="w-6 h-6" />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default YuEGenerationTab;

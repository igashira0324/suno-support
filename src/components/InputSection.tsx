import React, { useRef, useState, useMemo } from 'react';
import { MediaType, GenerationMode } from '../types';
import { Music, Image as ImageIcon, Video, X, Wand2, Mic2, MicOff, Sparkles, Search, SearchX, AlertTriangle } from 'lucide-react';

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
}

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
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchEnabled, setSearchEnabled] = useState(searchEngine !== 'none');
    const [progress, setProgress] = useState(0);

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

    const isNonOembedUrl = useMemo(() => {
        if (!youtubeUrl) return false;
        const isOembedSupported = OEMBED_PATTERNS.some(p => p.test(youtubeUrl));
        return !isOembedSupported && youtubeUrl.length > 5;
    }, [youtubeUrl]);

    // oEmbed対応URLが入力されたら自動的に検索エンジンをOFFにする
    React.useEffect(() => {
        if (youtubeUrl && youtubeUrl.length > 5) {
            const isOembedSupported = OEMBED_PATTERNS.some(p => p.test(youtubeUrl));
            if (isOembedSupported && searchEnabled) {
                setSearchEnabled(false);
                onSearchEngineChange('none');
            }
        }
    }, [youtubeUrl]);

    React.useEffect(() => {
        if (isLoading) {
            setProgress(0);
            const interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) return 95;
                    const increment = prev < 50 ? 5 : prev < 80 ? 2 : 1;
                    return prev + increment;
                });
            }, 500);
            return () => clearInterval(interval);
        } else {
            setProgress(100);
            const timer = setTimeout(() => setProgress(0), 500);
            return () => clearTimeout(timer);
        }
    }, [isLoading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const type = file.type.startsWith('video') ? MediaType.VIDEO : MediaType.IMAGE;
            onFileSelect(file, type);
        }
    };

    const handleClearFile = () => {
        onFileSelect(null, MediaType.NONE);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleSearchToggle = (enabled: boolean) => {
        setSearchEnabled(enabled);
        if (!enabled) {
            onSearchEngineChange('none');
        } else {
            onSearchEngineChange('google-grounding');
        }
    };

    const modeOptions = [
        { value: GenerationMode.AUTO, label: '自動', icon: Sparkles },
        { value: GenerationMode.VOCAL, label: '歌あり', icon: Mic2 },
        { value: GenerationMode.INSTRUMENTAL, label: '歌なし', icon: MicOff },
    ];

    const previewUrl = mediaFile && mediaType === MediaType.IMAGE ? URL.createObjectURL(mediaFile) : null;

    return (
        <div className="w-full max-w-5xl mx-auto bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <Music className="w-6 h-6 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">楽曲イメージ入力</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="space-y-3">
                    <div>
                        <label className="block text-base font-medium text-slate-300 mb-2">テーマ・コンセプト</label>
                        <textarea
                            value={inputText}
                            onChange={(e) => onTextChange(e.target.value)}
                            placeholder="例: ダーク系のEDM、切ない恋をテーマにした曲"
                            className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-4 text-base text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-base font-medium text-slate-300 mb-2">URL (oEmbedサポート)</label>
                        <input
                            type="text"
                            value={youtubeUrl}
                            onChange={(e) => onUrlChange(e.target.value)}
                            placeholder="YouTube, Spotify, Suno, X, SoundCloud, TikTok など"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-base text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                        {isNonOembedUrl && !searchEnabled && (
                            <div className="mt-2 flex items-start gap-2 p-3 bg-amber-950/30 border border-amber-500/40 rounded-lg text-amber-200 text-sm">
                                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-300">検索エンジンをONにしてください</p>
                                    <p className="text-xs text-amber-200/70 mt-1">このURLはoEmbed非対応のため、検索エンジンが必要です。</p>
                                </div>
                            </div>
                        )}
                        {youtubeUrl && (youtubeUrl.includes('suno.com') || youtubeUrl.includes('suno.ai')) && !youtubeUrl.includes('/song/') && (
                            <div className="mt-2 flex items-start gap-2 p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-red-200 text-sm">
                                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-red-300">正式な楽曲URLを入力してください</p>
                                    <p className="text-xs text-red-200/70 mt-1">短縮URLでは正しく解析できない可能性があります。<br />「https://suno.com/song/xxxxxxxx...」のような形式推奨です。</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-base font-medium text-slate-300 mb-2">画像・動画 (任意)</label>
                        {!mediaFile ? (
                            <div onClick={triggerFileUpload} className="group border border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-950/50 rounded-lg p-8 text-center cursor-pointer transition-all">
                                <div className="flex justify-center gap-4">
                                    <ImageIcon className="w-6 h-6 text-slate-500 group-hover:text-indigo-400" />
                                    <Video className="w-6 h-6 text-slate-500 group-hover:text-pink-400" />
                                </div>
                                <p className="text-base text-slate-500 mt-3">クリックしてアップロード</p>
                            </div>
                        ) : (
                            <div className="relative bg-slate-950 rounded-lg p-2 border border-slate-700 flex items-center gap-2">
                                <div className="h-10 w-10 rounded bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                                    {mediaType === MediaType.IMAGE && previewUrl ? (
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <Video className="w-5 h-5 text-indigo-400" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-white truncate">{mediaFile.name}</p>
                                    <p className="text-[10px] text-slate-500">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <button onClick={handleClearFile} className="p-1 rounded-full bg-slate-800 hover:bg-red-500/80 transition-colors">
                                    <X className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-base font-medium text-slate-300 mb-2">生成モード</label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                            {modeOptions.map((option) => {
                                const Icon = option.icon;
                                const isSelected = generationMode === option.value;
                                return (
                                    <button key={option.value} onClick={() => onModeChange(option.value)} className={`flex items-center justify-center gap-1.5 py-2.5 rounded text-sm font-medium transition-all ${isSelected ? 'bg-slate-800 text-indigo-300 shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}>
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
                            <select value={modelName} onChange={(e) => onModelChange(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash (最新・安定)</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (最先端)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-base font-medium text-slate-300 mb-2">検索エンジン</label>
                            <div className="flex gap-2">
                                <button onClick={() => handleSearchToggle(!searchEnabled)} className={`p-3 rounded-lg border transition-all ${searchEnabled ? 'bg-indigo-950/30 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                                    {searchEnabled ? <Search className="w-6 h-6" /> : <SearchX className="w-6 h-6" />}
                                </button>
                                {searchEnabled ? (
                                    <select value={searchEngine} onChange={(e) => onSearchEngineChange(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none">
                                        <option value="google-grounding">Google Grounding (内蔵)</option>
                                        <option value="google-custom">Google Custom Search</option>
                                        <option value="tavily">Tavily AI Search</option>
                                    </select>
                                ) : (
                                    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-base text-slate-500 flex items-center">OFF (節約)</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-base font-medium text-slate-300 mb-2">動画解析</label>
                        <button onClick={() => onVideoAnalysisToggle(!enableVideoAnalysis)} className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${enableVideoAnalysis ? 'bg-violet-950/30 border-violet-500/50 text-violet-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center gap-3">
                                <Video className={`w-6 h-6 ${enableVideoAnalysis ? 'text-violet-400' : 'text-slate-600'}`} />
                                <span className="text-base font-medium">{enableVideoAnalysis ? 'ON' : 'OFF'}</span>
                            </div>
                            <div className={`w-10 h-5 rounded-full relative transition-colors ${enableVideoAnalysis ? 'bg-violet-600' : 'bg-slate-800'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enableVideoAnalysis ? 'left-5' : 'left-0.5'}`} />
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <button onClick={onSubmit} disabled={isLoading || (!inputText && !youtubeUrl && !mediaFile)} className={`w-full py-4 rounded-xl font-bold text-base flex flex-col items-center justify-center gap-1 transition-all duration-300 shadow-lg ${isLoading || (!inputText && !youtubeUrl && !mediaFile) ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hover:shadow-indigo-500/25'}`}>
                {isLoading ? (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-lg">分析中... {progress}%</span>
                        </div>
                        <div className="w-full max-w-sm mt-3">
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden relative">
                                <div className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2"><Wand2 className="w-5 h-5" /><span>プロンプトを生成する</span></div>
                )}
            </button>
        </div>
    );
};

export default InputSection;

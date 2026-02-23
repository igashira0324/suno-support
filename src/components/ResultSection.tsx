import React, { useRef, useState, useEffect } from 'react';
import { SunoResponse, SongSelection } from '../types';
import { Copy, Check, Sparkles, Wand2, Mic2, MicOff, Disc, FileText, ListMusic, ArrowRight, Loader2, ExternalLink, Zap, Music2, AlertCircle } from 'lucide-react';

interface ResultSectionProps {
    data: SunoResponse;
    onTitleSelect?: (title: string) => void;
    isGeneratingPhase2?: boolean;
}

const formatContent = (content: string): string => {
    if (!content) return '';
    let formatted = content.replace(/\\n/g, '\n').trim();
    const structureTags = /\[(Intro|Verse\s*\d*|Chorus|Bridge|Outro|Pre-Chorus|Post-Chorus|Drop|Hook|Interlude|Breakdown|Instrumental|Solo|Refrain|Fade|End|Tag|Coda|Stanza|Skit|Spoken|Rap|Singing|Harmonies|Ad-lib|Whisper|Screaming|Break|Build)\]/gi;
    formatted = formatted.replace(structureTags, (match) => '\n\n' + match);
    formatted = formatted.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
    return formatted;
};

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };
    return (
        <button onClick={handleCopy} type="button" className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-indigo-500/30 border border-slate-700 hover:border-indigo-500/50 transition-all text-xs font-medium text-slate-400 hover:text-indigo-300 group ${copied ? 'text-emerald-400 border-emerald-500/50 bg-emerald-900/20' : ''}`}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "コピー完了" : (label || "コピー")}
        </button>
    );
};


interface SongCardProps {
    selection: SongSelection;
    label: string;
    isAlternative?: boolean;
    onMinimaxGenerate?: (title: string, style: string, content: string) => void;
}

const SongCard: React.FC<SongCardProps> = ({ selection, label, isAlternative = false, onMinimaxGenerate }) => {
    const [title, setTitle] = useState(selection.title);
    const [style, setStyle] = useState(selection.style);
    const [content, setContent] = useState(selection.content);
    const [isEditing, setIsEditing] = useState(false);

    const borderColor = isAlternative ? 'border-pink-500/30' : 'border-indigo-500/30';
    const glowColor = isAlternative ? 'shadow-pink-900/20' : 'shadow-indigo-900/20';
    const badgeBg = isAlternative ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

    const lyricsLimit = 3500;
    const promptLimit = 2000;

    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
        let timer: any;
        if (selection.isMinimaxGenerating) {
            setElapsedTime(0);
            timer = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            clearInterval(timer);
        }
        return () => clearInterval(timer);
    }, [selection.isMinimaxGenerating]);

    const handleGenerate = () => {
        if (content.length > lyricsLimit) {
            alert(`歌詞が上限（${lyricsLimit}文字）を超えています。現在は ${content.length} 文字です。`);
            return;
        }
        if (style.length > promptLimit) {
            alert(`プロンプトが上限（${promptLimit}文字）を超えています。現在は ${style.length} 文字です。`);
            return;
        }
        if (onMinimaxGenerate) {
            onMinimaxGenerate(title, style, content);
        }
    };

    return (
        <div className={`bg-gradient-to-br from-slate-900 to-slate-950 border ${borderColor} rounded-2xl p-1 overflow-hidden shadow-2xl ${glowColor}`}>
            {/* ... rest of the component ... */}
            <div className="bg-slate-950/90 rounded-xl p-6 sm:p-8 backdrop-blur-xl relative">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${badgeBg} flex items-center gap-1`}>
                            {isAlternative ? <Zap className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                            {label}
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${selection.instrumental ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'}`}>
                            {selection.instrumental ? <MicOff className="w-3 h-3" /> : <Mic2 className="w-3 h-3" />}
                            {selection.instrumental ? 'INSTRUMENTAL' : 'VOCAL'}
                        </div>
                    </div>
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-bold ${isEditing ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                        {isEditing ? '編集完了' : '編集する'}
                    </button>
                </div>

                <div className="mb-8 pb-6 border-b border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</label>
                        <CopyButton text={title} label="タイトルをコピー" />
                    </div>
                    {isEditing ? (
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-4 bg-slate-900 rounded-lg border border-slate-700 text-xl font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    ) : (
                        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h2>
                            {selection.comment && <p className="text-sm text-slate-400 italic mt-2">💡 {selection.comment}</p>}
                        </div>
                    )}
                </div>

                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Style Prompts</label>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${style.length > promptLimit ? 'text-red-400 font-bold' : 'text-slate-500'}`}>{style.length}/{promptLimit}</span>
                            <CopyButton text={style} label="Styleコピー" />
                        </div>
                    </div>
                    {isEditing ? (
                        <textarea
                            value={style}
                            onChange={(e) => setStyle(e.target.value)}
                            className="w-full h-24 p-4 bg-slate-900 rounded-lg border border-slate-700 font-mono text-sm text-indigo-300 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                    ) : (
                        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 font-mono text-sm text-indigo-300 break-words">{style}</div>
                    )}
                </div>

                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{selection.instrumental ? 'Structure Metatags' : 'Lyrics & Metatags'}</label>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${content.length > lyricsLimit ? 'text-red-400 font-bold' : 'text-slate-500'}`}>{content.length}/{lyricsLimit}</span>
                            <CopyButton text={formatContent(content)} label="歌詞・構成をコピー" />
                        </div>
                    </div>
                    <div className="relative">
                        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-50 ${isAlternative ? 'from-pink-500 via-rose-500 to-purple-500' : 'from-indigo-500 via-purple-500 to-pink-500'}`} />
                        {isEditing ? (
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full h-[400px] p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-700 font-mono text-sm text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                            />
                        ) : (
                            <pre className="p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-800 font-mono text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">
                                {formatContent(content)}
                            </pre>
                        )}
                    </div>
                </div>

                {/* MiniMax Section */}
                <div className="pt-6 border-t border-slate-800">
                    {!selection.minimaxAudioUrl ? (
                        <div className="space-y-4">
                            {selection.minimaxError && (
                                <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 text-sm flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                                    <div>
                                        <p className="font-bold text-red-300">生成に失敗しました</p>
                                        <p className="opacity-80">{selection.minimaxError}</p>
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={handleGenerate}
                                disabled={selection.isMinimaxGenerating}
                                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${selection.isMinimaxGenerating ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white hover:shadow-orange-500/25'}`}
                            >
                                {selection.isMinimaxGenerating ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>MiniMax Music 2.5 で生成中... ({elapsedTime}秒経過 / 最大600秒)</span>
                                    </>
                                ) : (
                                    <>
                                        <Music2 className="w-5 h-5" />
                                        <span>{selection.minimaxError ? 'MiniMax で再試行' : 'MiniMax Music 2.5 で楽曲を生成'}</span>
                                    </>
                                )}
                            </button>
                            <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
                                ※ 生成には通常 1〜3 分かかります（混雑時は最長10分）。
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" />MiniMax Music 2.5 生成完了</span>
                                <a
                                    href={selection.minimaxAudioUrl}
                                    download={`${title}.mp3`}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-all"
                                >
                                    ファイルをダウンロード
                                </a>
                            </div>
                            <audio controls src={selection.minimaxAudioUrl} className="w-full h-10 filter invert hue-rotate-180 opacity-80" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


interface ResultSectionProps {
    data: SunoResponse;
    onTitleSelect?: (title: string) => void;
    isGeneratingPhase2?: boolean;
    onMinimaxGenerate?: (title: string, style: string, content: string, index: number) => void;
}

const ResultSection: React.FC<ResultSectionProps> = ({ data, onTitleSelect, isGeneratingPhase2, onMinimaxGenerate }) => {
    return (
        <div className="w-full max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3 text-indigo-400 shadow-sm"><Disc className="w-5 h-5" /><h3 className="font-semibold uppercase tracking-wider text-sm">分析結果 (Analysis)</h3></div>
                <p className="text-slate-300 leading-relaxed mb-4">{data.analysis}</p>
                {data.tokenUsage && (
                    <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-500">
                        <span className="font-semibold text-slate-400">📊 Token Usage:</span>
                        <span>Prompt: <span className="text-amber-400 font-mono">{data.tokenUsage.promptTokenCount.toLocaleString()}</span></span>
                        <span>Response: <span className="text-emerald-400 font-mono">{data.tokenUsage.candidatesTokenCount.toLocaleString()}</span></span>
                        <span>Total: <span className="text-indigo-400 font-mono">{data.tokenUsage.totalTokenCount.toLocaleString()}</span></span>
                    </div>
                )}
                {data.sources && data.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                        <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-bold uppercase tracking-widest"><ExternalLink className="w-3 h-3" />参考ソース</div>
                        <div className="flex flex-wrap gap-2">
                            {data.sources.map((source, i) => (<a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 rounded flex items-center gap-1.5 transition-colors">{source.title}</a>))}
                        </div>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-pink-400"><FileText className="w-5 h-5" /><h3 className="font-semibold uppercase tracking-wider text-sm">タイトル候補</h3></div>
                        {onTitleSelect && <span className="text-xs text-pink-300/60">タイトルを選んで生成 →</span>}
                    </div>
                    <ul className="space-y-3 flex-1">
                        {data.titleCandidates.map((title, idx) => {
                            const isGenerated = data.generatedTitles?.includes(title);
                            return (
                                <li key={idx} className={`flex items-center justify-between p-3 rounded-xl transition-colors group border ${isGenerated ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-slate-950/50 hover:bg-slate-800/50 border-transparent hover:border-pink-500/30'}`}>
                                    <span className={`text-sm flex-1 ${isGenerated ? 'text-emerald-300' : 'text-slate-200'}`}>
                                        {isGenerated && <Check className="w-4 h-4 inline mr-2" />}
                                        {title}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <CopyButton text={title} />
                                        {onTitleSelect && !isGenerated && (
                                            <button
                                                onClick={() => onTitleSelect(title)}
                                                disabled={isGeneratingPhase2}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-600/80 hover:bg-pink-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isGeneratingPhase2 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                                                生成
                                            </button>
                                        )}
                                        {isGenerated && <span className="text-xs text-emerald-400 font-bold">生成済み</span>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
                    <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2 text-emerald-400"><ListMusic className="w-5 h-5" /><h3 className="font-semibold uppercase tracking-wider text-sm">スタイル候補</h3></div></div>
                    <ul className="space-y-3 flex-1">
                        {data.styleCandidates.map((style, idx) => (<li key={idx} className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/50 transition-colors group border border-transparent hover:border-slate-700"><div className="flex items-start justify-between gap-2"><span className="text-xs text-emerald-100 font-mono leading-relaxed">{style}</span><CopyButton text={style} /></div></li>))}
                    </ul>
                </div>
            </div>

            {/* Show generated selections from the array */}
            {data.generatedSelections && data.generatedSelections.length > 0 && (
                <div className="space-y-6">
                    {data.generatedSelections.map((selection, idx) => (
                        <div key={idx}>
                            <SongCard
                                selection={selection}
                                label={`生成結果 ${idx + 1}`}
                                onMinimaxGenerate={(t, s, c) => onMinimaxGenerate?.(t, s, c, idx)}
                            />
                            {selection.tokenUsage && (
                                <div className="mt-2 flex items-center justify-end gap-4 text-xs text-slate-500">
                                    <span className="font-semibold text-slate-400">📊 Token:</span>
                                    <span>Prompt: <span className="text-amber-400 font-mono">{selection.tokenUsage.promptTokenCount.toLocaleString()}</span></span>
                                    <span>Response: <span className="text-emerald-400 font-mono">{selection.tokenUsage.candidatesTokenCount.toLocaleString()}</span></span>
                                    <span>Total: <span className="text-indigo-400 font-mono">{selection.tokenUsage.totalTokenCount.toLocaleString()}</span></span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Show prompt when no content yet */}
            {(!data.generatedSelections || data.generatedSelections.length === 0) && onTitleSelect && (
                <div className="text-center py-12 bg-slate-900/50 border border-dashed border-slate-700 rounded-2xl">
                    <Sparkles className="w-10 h-10 text-pink-400 mx-auto mb-4 opacity-60" />
                    <p className="text-slate-400 text-lg font-medium">タイトルを選んでプロンプトを生成</p>
                    <p className="text-slate-500 text-sm mt-2">上のタイトル候補から1つを選択してください</p>
                </div>
            )}
        </div>
    );
};

export default ResultSection;

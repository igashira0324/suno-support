import React from 'react';
import { AlertCircle, Loader2, Music2, Check } from 'lucide-react';

interface MinimaxGeneratePanelProps {
    minimaxAudioUrl?: string;
    isMinimaxGenerating: boolean;
    minimaxError?: string;
    elapsedTime: number;
    title: string;
    onGenerate: () => void;
}

export const MinimaxGeneratePanel: React.FC<MinimaxGeneratePanelProps> = ({
    minimaxAudioUrl,
    isMinimaxGenerating,
    minimaxError,
    elapsedTime,
    title,
    onGenerate
}) => {
    return (
        <div className="pt-6 border-t border-slate-800">
            {!minimaxAudioUrl ? (
                <div className="space-y-4">
                    {minimaxError && (
                        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 text-sm flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                            <div>
                                <p className="font-bold text-red-300">生成に失敗しました</p>
                                <p className="opacity-80">{minimaxError}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={onGenerate}
                        disabled={isMinimaxGenerating}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isMinimaxGenerating ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white hover:shadow-orange-500/25'}`}
                    >
                        {isMinimaxGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>MiniMax Music 2.5 で生成中... ({elapsedTime}秒経過)</span>
                            </>
                        ) : (
                            <>
                                <Music2 className="w-5 h-5" />
                                <span>{minimaxError ? 'MiniMax で再試行' : 'MiniMax Music 2.5 で楽曲を生成'}</span>
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
                        ※ 生成には通常 1〜3 分かかります。
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5"><Check className="w-4 h-4" />MiniMax Music 2.5 生成完了</span>
                        <a
                            href={minimaxAudioUrl}
                            download={`${title}.mp3`}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-all"
                        >
                            ファイルをダウンロード
                        </a>
                    </div>
                    <audio controls src={minimaxAudioUrl} className="w-full h-10 filter invert hue-rotate-180 opacity-80" />
                </div>
            )}
        </div>
    );
};

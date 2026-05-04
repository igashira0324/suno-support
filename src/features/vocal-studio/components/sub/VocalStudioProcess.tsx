import React from 'react';
import { Sparkles, AlertCircle, XCircle } from 'lucide-react';

interface VocalStudioProcessProps {
    isProcessing: boolean;
    status: string;
    progress: number;
    error: string | null;
    canGenerate: boolean;
    onGenerate: () => void;
    onCancel?: () => void;
}

export const VocalStudioProcess: React.FC<VocalStudioProcessProps> = ({
    isProcessing,
    status,
    progress,
    error,
    canGenerate,
    onGenerate,
    onCancel
}) => {
    return (
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl sticky top-6">
            <div className="flex flex-col gap-6">
                <button
                    onClick={onGenerate}
                    disabled={isProcessing || !canGenerate}
                    className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 p-[2px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_40px_rgba(168,85,247,0.3)]"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
                    <div className="relative bg-slate-900 rounded-[10px] px-6 py-4 flex items-center justify-center gap-3 transition-colors duration-300 group-hover:bg-opacity-0">
                        {isProcessing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span className="font-bold text-white text-lg tracking-wide">
                                    {status}
                                </span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 text-white" />
                                <span className="font-bold text-white text-lg tracking-wide">
                                    ボーカルを生成してミックス
                                </span>
                            </>
                        )}
                    </div>
                </button>

                {isProcessing && onCancel && (
                    <button
                        onClick={onCancel}
                        className="w-full py-2 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
                    >
                        <XCircle className="w-4 h-4" />
                        生成をキャンセル
                    </button>
                )}

                <div className="space-y-4">
                    {isProcessing && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium">
                                <span className="text-purple-300 animate-pulse">{status}</span>
                                <span className="text-slate-400">{progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500 relative"
                                    style={{ width: `${progress}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-red-300 break-words">{error}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

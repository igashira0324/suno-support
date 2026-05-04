import React from 'react';
import { Check, Mic, Music } from 'lucide-react';
import WaveformPlayer from '../../../../components/WaveformPlayer';

interface VocalStudioResultsProps {
    vocalUrl: string | null;
    mixUrl: string | null;
}

export const VocalStudioResults: React.FC<VocalStudioResultsProps> = ({ vocalUrl, mixUrl }) => {
    if (!vocalUrl && !mixUrl) return null;

    return (
        <div className="mt-8 space-y-6 pt-8 border-t border-white/10 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
                <Check className="w-5 h-5" />
                <h3 className="text-xl font-bold">生成が完了しました！</h3>
            </div>

            {vocalUrl && (
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-300 font-medium flex items-center gap-2">
                            <Mic className="w-4 h-4 text-purple-400" />
                            生成されたボーカル (Dry)
                        </span>
                        <a 
                            href={vocalUrl} 
                            download 
                            className="text-purple-400 hover:text-purple-300 hover:underline decoration-purple-400/30 underline-offset-4"
                        >
                            ダウンロード
                        </a>
                    </div>
                    <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5 shadow-inner">
                        <WaveformPlayer src={vocalUrl} theme="purple" subtitle="Vocal Only" />
                    </div>
                </div>
            )}

            {mixUrl && (
                <div className="space-y-2 pt-4">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-emerald-300 font-medium flex items-center gap-2">
                            <Music className="w-4 h-4" />
                            最終ミックス (Vocal + Inst)
                        </span>
                        <a 
                            href={mixUrl} 
                            download 
                            className="text-emerald-400 hover:text-emerald-300 hover:underline decoration-emerald-400/30 underline-offset-4"
                        >
                            ダウンロード
                        </a>
                    </div>
                    <div className="bg-slate-950/50 rounded-xl p-4 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                        <WaveformPlayer src={mixUrl} theme="emerald" subtitle="Final Mix" />
                    </div>
                </div>
            )}
        </div>
    );
};

import React from 'react';
import { AudioLines, Info, FileAudio, Music, SlidersHorizontal, Mic } from 'lucide-react';

interface VocalStudioSettingsProps {
    guideInstrument: 'piano' | 'guitar' | 'vocals' | 'other' | 'bass' | 'drums';
    lyrics: string;
    isProcessing: boolean;
    onInstrumentChange: (inst: 'piano' | 'guitar' | 'vocals' | 'other' | 'bass' | 'drums') => void;
    onLyricsChange: (lyrics: string) => void;
}

export const VocalStudioSettings: React.FC<VocalStudioSettingsProps> = ({
    guideInstrument,
    lyrics,
    isProcessing,
    onInstrumentChange,
    onLyricsChange
}) => {
    const instrumentOptions = [
        { id: 'other', label: 'Other / Synth', desc: '推奨: メインボーカル以外のメロディ', icon: <AudioLines className="w-4 h-4" /> },
        { id: 'piano', label: 'Piano', desc: 'ピアノパートから抽出', icon: <Music className="w-4 h-4" /> },
        { id: 'guitar', label: 'Guitar', desc: 'ギターパートから抽出', icon: <SlidersHorizontal className="w-4 h-4" /> },
        { id: 'vocals', label: 'Vocals', desc: '既存ボーカルから上書き抽出', icon: <Mic className="w-4 h-4" /> }
    ] as const;

    return (
        <div className="space-y-6">
            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <AudioLines className="w-5 h-5 text-purple-400" />
                    2. ガイドメロディの抽出元
                </h2>
                <div className="flex items-start gap-2 mb-6">
                    <Info className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-400">
                        インスト音源の中で「主旋律（メロディ）」を奏でている楽器を選択してください。Demucsを用いてそのパートを分离し、MIDIに自動変換します。
                    </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    {instrumentOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => onInstrumentChange(opt.id as any)}
                            disabled={isProcessing}
                            className={`p-4 rounded-xl border flex flex-col items-start gap-2 transition-all duration-300 text-left ${
                                guideInstrument === opt.id 
                                    ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                                    : 'bg-slate-950/50 border-white/5 hover:border-purple-500/30'
                            }`}
                        >
                            <div className={`p-2 rounded-lg ${guideInstrument === opt.id ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-800 text-slate-400'}`}>
                                {opt.icon}
                            </div>
                            <div>
                                <div className={`font-semibold ${guideInstrument === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</div>
                                <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <FileAudio className="w-5 h-5 text-purple-400" />
                    3. 歌詞の入力
                </h2>
                <textarea
                    value={lyrics}
                    onChange={e => onLyricsChange(e.target.value)}
                    placeholder="ここに歌詞を入力してください。AIが自動でタイミングを合わせて歌唱します..."
                    className="w-full h-48 bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none font-mono text-sm leading-relaxed"
                    disabled={isProcessing}
                />
            </div>
        </div>
    );
};

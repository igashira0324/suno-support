import React from 'react';
import { Wand2 } from 'lucide-react';

export const VocalStudioHeader: React.FC = () => {
    return (
        <div className="text-center mb-12 space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 rounded-2xl mb-4 ring-1 ring-purple-500/30">
                <Wand2 className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-5xl font-extrabold bg-gradient-to-br from-white via-purple-100 to-purple-400 bg-clip-text text-transparent tracking-tight">
                カスタムAIボーカルスタジオ
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                既存のインストゥルメンタル楽曲と歌詞から、AI技術（Audio-to-MIDI分離＆歌声合成）を用いて新しいボーカルトラックを生成し、完璧なミックスを作り出します。
            </p>
        </div>
    );
};

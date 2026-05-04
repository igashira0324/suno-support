import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface UrlInputProps {
    value: string;
    onChange: (url: string) => void;
    searchEnabled: boolean;
}

const OEMBED_PATTERNS = [
    /youtube\.com/, /youtu\.be/,
    /open\.spotify\.com/,
    /soundcloud\.com/,
    /suno\.com/, /suno\.ai/
];

export const UrlInput: React.FC<UrlInputProps> = ({ value, onChange, searchEnabled }) => {
    const isNonOembedUrl = useMemo(() => {
        if (!value) return false;
        const isOembedSupported = OEMBED_PATTERNS.some(p => p.test(value));
        return !isOembedSupported && value.length > 5;
    }, [value]);

    return (
        <div>
            <label className="block text-base font-medium text-slate-300 mb-2">URL (oEmbedサポート)</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
            {value && (value.includes('suno.com') || value.includes('suno.ai')) && !value.includes('/song/') && (
                <div className="mt-2 flex items-start gap-2 p-3 bg-red-950/30 border border-red-500/40 rounded-lg text-red-200 text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-red-300">正式な楽曲URLを入力してください</p>
                        <p className="text-xs text-red-200/70 mt-1">短縮URLでは正しく解析できない可能性があります。<br />「https://suno.com/song/xxxxxxxx...」のような形式推奨です。</p>
                    </div>
                </div>
            )}
        </div>
    );
};

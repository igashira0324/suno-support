import React from 'react';
import { Sparkles, Zap, MicOff, Mic2 } from 'lucide-react';

interface SongHeaderProps {
    label: string;
    isAlternative: boolean;
    instrumental: boolean;
    isEditing: boolean;
    onToggleEdit: () => void;
}

export const SongHeader: React.FC<SongHeaderProps> = ({ 
    label, 
    isAlternative, 
    instrumental, 
    isEditing, 
    onToggleEdit 
}) => {
    const badgeBg = isAlternative 
        ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' 
        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

    return (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${badgeBg} flex items-center gap-1`}>
                    {isAlternative ? <Zap className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    {label}
                </div>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${instrumental ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'}`}>
                    {instrumental ? <MicOff className="w-3 h-3" /> : <Mic2 className="w-3 h-3" />}
                    {instrumental ? 'INSTRUMENTAL' : 'VOCAL'}
                </div>
            </div>
            <button
                onClick={onToggleEdit}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all font-bold ${isEditing ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
            >
                {isEditing ? '編集完了' : '編集する'}
            </button>
        </div>
    );
};

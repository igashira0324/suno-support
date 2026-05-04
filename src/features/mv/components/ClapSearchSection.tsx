import React, { useState, useEffect } from 'react';
import { Search, Music, Loader2, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { CLAPResult, CLAPPreset } from '../types';

interface ClapSearchSectionProps {
    onSearch: (query: string) => void;
    results: CLAPResult[];
    presets: CLAPPreset[];
    isSearching: boolean;
    onResultClick: (result: CLAPResult) => void;
    onLoadPresets: () => void;
}

export const ClapSearchSection: React.FC<ClapSearchSectionProps> = ({
    onSearch,
    results,
    presets,
    isSearching,
    onResultClick,
    onLoadPresets
}) => {
    const [query, setQuery] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        onLoadPresets();
    }, [onLoadPresets]);

    return (
        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl overflow-hidden">
            <div 
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-900/50 transition-all"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <Search className="w-5 h-5 text-indigo-400" />
                    <div>
                        <h3 className="text-sm font-bold text-white">Semantic Search (CLAP)</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Find parts by describing them</p>
                    </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </div>

            {isExpanded && (
                <div className="p-6 pt-0 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onSearch(query)}
                                placeholder="Describe the sound (e.g., 'energetic drop', 'soft vocal')"
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                            />
                        </div>
                        <button
                            onClick={() => onSearch(query)}
                            disabled={isSearching || !query.trim()}
                            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-all"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                        </button>
                    </div>

                    {presets.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {presets.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => { setQuery(p.query); onSearch(p.query); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-white/5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                                >
                                    <Tag className="w-3 h-3" />
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Top Matches</span>
                            <div className="space-y-2">
                                {results.map((res, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onResultClick(res)}
                                        className="w-full flex items-center justify-between p-4 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 rounded-2xl transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 text-xs font-black">
                                                #{res.rank}
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white block">Match at {(res.start).toFixed(1)}s</span>
                                                <span className="text-[10px] text-indigo-400/70 font-mono">Confidence: {(res.score * 100).toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <Music className="w-4 h-4 text-indigo-500/30 group-hover:text-indigo-400 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


import React, { useState } from 'react';
import { SunoResponse, SongSelection } from '../types';
import { Copy, Check, Music2, ListMusic, Disc, FileText, Mic2, MicOff, Sparkles, Zap, ExternalLink } from 'lucide-react';

interface ResultSectionProps {
  data: SunoResponse;
}

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-indigo-500/20 border border-slate-700 hover:border-indigo-500/50 transition-all text-xs font-medium text-slate-400 hover:text-indigo-300 group"
      title="クリップボードにコピー"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (copied ? "コピー完了" : "コピー")}
    </button>
  );
};

const SongCard: React.FC<{ 
  selection: SongSelection; 
  label: string; 
  isAlternative?: boolean; 
}> = ({ selection, label, isAlternative = false }) => {
  const borderColor = isAlternative ? 'border-pink-500/30' : 'border-indigo-500/30';
  const glowColor = isAlternative ? 'shadow-pink-900/20' : 'shadow-indigo-900/20';
  const badgeBg = isAlternative ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

  return (
    <div className={`bg-gradient-to-br from-slate-900 to-slate-950 border ${borderColor} rounded-2xl p-1 overflow-hidden shadow-2xl ${glowColor}`}>
      <div className="bg-slate-950/90 rounded-xl p-6 sm:p-8 backdrop-blur-xl relative">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <div className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${badgeBg} flex items-center gap-1`}>
                {isAlternative ? <Zap className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {label}
              </div>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${selection.instrumental ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'}`}>
                {selection.instrumental ? <MicOff className="w-3 h-3" /> : <Mic2 className="w-3 h-3" />}
                {selection.instrumental ? 'INSTRUMENTAL' : 'VOCAL'}
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              {selection.title}
            </h2>
            {selection.comment && (
               <p className="text-sm text-slate-400 italic">
                 💡 {selection.comment}
               </p>
            )}
          </div>
        </div>

        {/* Style Display */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Style Prompts</label>
            <CopyButton text={selection.style} label="Styleコピー" />
          </div>
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 font-mono text-sm text-indigo-300 break-words">
            {selection.style}
          </div>
        </div>

        {/* Lyrics/Content Display */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {selection.instrumental ? 'Structure Metatags' : 'Lyrics & Metatags'}
            </label>
            <CopyButton text={selection.content} label="歌詞・構成をコピー" />
          </div>
          <div className="relative">
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-50 ${isAlternative ? 'from-pink-500 via-rose-500 to-purple-500' : 'from-indigo-500 via-purple-500 to-pink-500'}`} />
            <pre className="p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-800 font-mono text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">
              {selection.content}
            </pre>
          </div>
        </div>

      </div>
    </div>
  );
};

const ResultSection: React.FC<ResultSectionProps> = ({ data }) => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* Analysis Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-3 text-indigo-400">
          <Disc className="w-5 h-5" />
          <h3 className="font-semibold uppercase tracking-wider text-sm">分析結果 (Analysis)</h3>
        </div>
        <p className="text-slate-300 leading-relaxed mb-4">
          {data.analysis}
        </p>
        
        {/* Sources / Grounding */}
        {data.sources && data.sources.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
              <ExternalLink className="w-3 h-3" />
              参考ソース
            </div>
            <div className="flex flex-wrap gap-2">
              {data.sources.map((source, i) => (
                <a 
                  key={i} 
                  href={source.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 rounded flex items-center gap-1.5 transition-colors"
                >
                  {source.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Title Candidates */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-pink-400">
               <FileText className="w-5 h-5" />
               <h3 className="font-semibold uppercase tracking-wider text-sm">タイトル候補</h3>
             </div>
          </div>
          <ul className="space-y-3 flex-1">
            {data.titleCandidates.map((title, idx) => (
              <li key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/50 transition-colors group border border-transparent hover:border-slate-700">
                <span className="text-sm text-slate-200">{title}</span>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton text={title} label=" " />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Style Candidates */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2 text-emerald-400">
               <ListMusic className="w-5 h-5" />
               <h3 className="font-semibold uppercase tracking-wider text-sm">スタイル候補</h3>
             </div>
          </div>
          <ul className="space-y-3 flex-1">
            {data.styleCandidates.map((style, idx) => (
              <li key={idx} className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/50 transition-colors group border border-transparent hover:border-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-emerald-100 font-mono leading-relaxed">{style}</span>
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                    <CopyButton text={style} label=" " />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Best Selection */}
      <SongCard 
        selection={data.bestSelection} 
        label="ベストセレクト (Recommended)" 
      />

      {/* Alternative Selection */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-800"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 bg-slate-950 text-sm text-slate-500 font-medium italic uppercase tracking-tighter">Another Approach</span>
        </div>
      </div>

      <SongCard 
        selection={data.alternativeSelection} 
        label="変化球プラン (Alternative)" 
        isAlternative={true} 
      />
      
    </div>
  );
};

export default ResultSection;

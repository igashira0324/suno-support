import React from 'react';
import { SunoResponse } from '../../../types';
import { Sparkles } from 'lucide-react';
import { AnalysisPanel } from './sub/AnalysisPanel';
import { TitleCandidatesPanel } from './sub/TitleCandidatesPanel';
import { StyleCandidatesPanel } from './sub/StyleCandidatesPanel';
import { SongCard } from './sub/SongCard';

interface ResultSectionProps {
    data: SunoResponse;
    onTitleSelect?: (title: string) => void;
    isGeneratingPhase2?: boolean;
    onMinimaxGenerate?: (title: string, style: string, content: string, index: number) => void;
}

const ResultSection: React.FC<ResultSectionProps> = ({
    data,
    onTitleSelect,
    isGeneratingPhase2,
    onMinimaxGenerate,
}) => {
    return (
        <div className="w-full max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Analysis Result */}
            <AnalysisPanel data={data} />

            {/* Candidates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TitleCandidatesPanel
                    titles={data.titleCandidates}
                    generatedTitles={data.generatedTitles}
                    onTitleSelect={onTitleSelect}
                    isGeneratingPhase2={isGeneratingPhase2}
                />
                <StyleCandidatesPanel styles={data.styleCandidates} />
            </div>

            {/* Generated Selections */}
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

            {/* Empty State / Prompt for Phase 2 */}
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

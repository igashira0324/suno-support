import React from 'react';
import { CopyButton } from '../CopyButton';

interface StylePromptBlockProps {
    style: string;
    onStyleChange: (val: string) => void;
    isEditing: boolean;
    limit: number;
}

export const StylePromptBlock: React.FC<StylePromptBlockProps> = ({ 
    style, 
    onStyleChange, 
    isEditing, 
    limit 
}) => {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Style Prompts</label>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${style.length > limit ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                        {style.length}/{limit}
                    </span>
                    <CopyButton text={style} label="Styleコピー" />
                </div>
            </div>
            {isEditing ? (
                <textarea
                    value={style}
                    onChange={(e) => onStyleChange(e.target.value)}
                    className="w-full h-24 p-4 bg-slate-900 rounded-lg border border-slate-700 font-mono text-sm text-indigo-300 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
            ) : (
                <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 font-mono text-sm text-indigo-300 break-words">
                    {style}
                </div>
            )}
        </div>
    );
};

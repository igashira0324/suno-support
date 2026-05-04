import React from 'react';
import { CopyButton } from '../CopyButton';
import { formatContent } from './utils';

interface LyricsBlockProps {
    content: string;
    onContentChange: (val: string) => void;
    isEditing: boolean;
    instrumental: boolean;
    isAlternative: boolean;
    limit: number;
}

export const LyricsBlock: React.FC<LyricsBlockProps> = ({ 
    content, 
    onContentChange, 
    isEditing, 
    instrumental, 
    isAlternative, 
    limit 
}) => {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {instrumental ? 'Structure Metatags' : 'Lyrics & Metatags'}
                </label>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${content.length > limit ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                        {content.length}/{limit}
                    </span>
                    <CopyButton text={formatContent(content)} label="歌詞・構成をコピー" />
                </div>
            </div>
            <div className="relative">
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-50 ${isAlternative ? 'from-pink-500 via-rose-500 to-purple-500' : 'from-indigo-500 via-purple-500 to-pink-500'}`} />
                {isEditing ? (
                    <textarea
                        value={content}
                        onChange={(e) => onContentChange(e.target.value)}
                        className="w-full h-[400px] p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-700 font-mono text-sm text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                    />
                ) : (
                    <pre className="p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-800 font-mono text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">
                        {formatContent(content)}
                    </pre>
                )}
            </div>
        </div>
    );
};

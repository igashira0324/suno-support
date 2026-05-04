import React from 'react';
import { CopyButton } from '../CopyButton';

interface EditableTitleBlockProps {
    title: string;
    onTitleChange: (val: string) => void;
    comment?: string;
    isEditing: boolean;
}

export const EditableTitleBlock: React.FC<EditableTitleBlockProps> = ({ 
    title, 
    onTitleChange, 
    comment, 
    isEditing 
}) => {
    return (
        <div className="mb-8 pb-6 border-b border-slate-800">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</label>
                <CopyButton text={title} label="タイトルをコピー" />
            </div>
            {isEditing ? (
                <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="w-full p-4 bg-slate-900 rounded-lg border border-slate-700 text-xl font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                />
            ) : (
                <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h2>
                    {comment && <p className="text-sm text-slate-400 italic mt-2">💡 {comment}</p>}
                </div>
            )}
        </div>
    );
};

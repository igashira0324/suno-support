import React from 'react';

interface ConceptInputProps {
    value: string;
    onChange: (text: string) => void;
}

export const ConceptInput: React.FC<ConceptInputProps> = ({ value, onChange }) => {
    return (
        <div>
            <label className="block text-base font-medium text-slate-300 mb-2">テーマ・コンセプト</label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="例: ダーク系のEDM、切ない恋をテーマにした曲"
                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-4 text-base text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
            />
        </div>
    );
};

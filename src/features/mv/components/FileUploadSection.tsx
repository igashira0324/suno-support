import React, { useRef, useState } from 'react';
import { Upload, Globe, Link } from 'lucide-react';

interface FileUploadSectionProps {
    onFileSelect: (file: File) => void;
    onUrlImport: (url: string) => void;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({ onFileSelect, onUrlImport }) => {
    const [importUrl, setImportUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
    };

    return (
        <div className="space-y-6">
            <div 
                className="group border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/50 rounded-3xl p-12 text-center cursor-pointer transition-all hover:bg-slate-900/50" 
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-1">Upload Audio File</h3>
                <p className="text-slate-500 text-xs max-w-sm mx-auto">MP3, WAV, or AAC. GPU Acceleration Enabled.</p>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" />
            </div>

            <div className="relative flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-800"></div>
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">OR</span>
                <div className="flex-1 h-px bg-slate-800"></div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    Import from URL (YouTube, TikTok, Suno, etc.)
                </label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Link className="w-4 h-4 text-slate-600" />
                        </div>
                        <input
                            type="text"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onUrlImport(importUrl)}
                            placeholder="Paste URL here..."
                            className="w-full bg-slate-900/80 text-white pl-11 pr-4 py-3 rounded-xl border border-slate-800 focus:border-indigo-500/50 focus:outline-none placeholder-slate-600 text-sm transition-all"
                        />
                    </div>
                    <button 
                        onClick={() => onUrlImport(importUrl)}
                        disabled={!importUrl.trim()}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-all"
                    >
                        Import
                    </button>
                </div>
            </div>
        </div>
    );
};

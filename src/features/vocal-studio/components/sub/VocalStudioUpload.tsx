import React from 'react';
import { Upload, Music } from 'lucide-react';
import WaveformPlayer from '../../../../components/WaveformPlayer';

interface VocalStudioUploadProps {
    fileInputRef: React.RefObject<HTMLInputElement>;
    instrumentalFile: File | null;
    instrumentalUrl: string | null;
    isProcessing: boolean;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const VocalStudioUpload: React.FC<VocalStudioUploadProps> = ({
    fileInputRef,
    instrumentalFile,
    instrumentalUrl,
    isProcessing,
    onFileChange
}) => {
    return (
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-400" />
                1. インストゥルメンタルのアップロード
            </h2>
            
            <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                    instrumentalFile 
                        ? 'border-purple-500/50 bg-purple-500/5' 
                        : 'border-slate-700 hover:border-purple-500/30 hover:bg-white/5'
                }`}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={onFileChange}
                    accept="audio/*"
                    className="hidden"
                />
                {instrumentalFile ? (
                    <div className="space-y-4">
                        <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto text-purple-400">
                            <Music className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="text-purple-300 font-medium truncate max-w-[250px] mx-auto">
                                {instrumentalFile.name}
                            </p>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="text-sm text-slate-400 hover:text-white mt-2 underline decoration-dashed underline-offset-4"
                                disabled={isProcessing}
                            >
                                ファイルを選び直す
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400 transition-transform group-hover:scale-110 duration-300">
                            <Upload className="w-8 h-8" />
                        </div>
                        <p className="text-slate-300 font-medium">インスト音源をアップロード</p>
                        <p className="text-sm text-slate-500">MP3, WAV, M4A に対応</p>
                    </div>
                )}
            </div>

            {instrumentalUrl && (
                <div className="mt-4 p-4 bg-slate-950/50 rounded-xl border border-white/5">
                    <WaveformPlayer src={instrumentalUrl} theme="purple" subtitle="Input Audio" />
                </div>
            )}
        </div>
    );
};

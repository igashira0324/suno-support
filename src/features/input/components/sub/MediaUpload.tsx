import React, { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, Video, X } from 'lucide-react';
import { MediaType } from '../../../../types';

interface MediaUploadProps {
    mediaType: MediaType;
    mediaFile: File | null;
    onFileSelect: (file: File | null, type: MediaType) => void;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({ mediaType, mediaFile, onFileSelect }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (mediaFile && mediaType === MediaType.IMAGE) {
            const url = URL.createObjectURL(mediaFile);
            setPreviewUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                setPreviewUrl(null);
            };
        }
        setPreviewUrl(null);
    }, [mediaFile, mediaType]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const type = file.type.startsWith('video') ? MediaType.VIDEO : MediaType.IMAGE;
            onFileSelect(file, type);
        }
    };

    const handleClearFile = () => {
        onFileSelect(null, MediaType.NONE);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    return (
        <div>
            <label className="block text-base font-medium text-slate-300 mb-2">画像・動画 (任意)</label>
            {!mediaFile ? (
                <div onClick={triggerFileUpload} className="group border border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-950/50 rounded-lg p-8 text-center cursor-pointer transition-all">
                    <div className="flex justify-center gap-4">
                        <ImageIcon className="w-6 h-6 text-slate-500 group-hover:text-indigo-400" />
                        <Video className="w-6 h-6 text-slate-500 group-hover:text-pink-400" />
                    </div>
                    <p className="text-base text-slate-500 mt-3">クリックしてアップロード</p>
                </div>
            ) : (
                <div className="relative bg-slate-950 rounded-lg p-2 border border-slate-700 flex items-center gap-2">
                    <div className="h-10 w-10 rounded bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                        {mediaType === MediaType.IMAGE && previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <Video className="w-5 h-5 text-indigo-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{mediaFile.name}</p>
                        <p className="text-[10px] text-slate-500">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button onClick={handleClearFile} className="p-1 rounded-full bg-slate-800 hover:bg-red-500/80 transition-colors">
                        <X className="w-3 h-3 text-white" />
                    </button>
                </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
        </div>
    );
};

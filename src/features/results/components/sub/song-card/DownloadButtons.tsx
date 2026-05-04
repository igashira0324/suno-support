import React from 'react';
import { Download } from 'lucide-react';

interface DownloadButtonsProps {
    onDownloadTxt: () => void;
    onDownloadJson: () => void;
    hasTimeline: boolean;
}

export const DownloadButtons: React.FC<DownloadButtonsProps> = ({ 
    onDownloadTxt, 
    onDownloadJson, 
    hasTimeline 
}) => {
    return (
        <div className="mb-6 flex justify-end gap-3">
            <button
                onClick={onDownloadTxt}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-bold transition-all shadow-lg hover:shadow-teal-500/25"
            >
                <Download className="w-4 h-4" />
                Download TXT
            </button>
            {hasTimeline && (
                <button
                    onClick={onDownloadJson}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-lg hover:shadow-violet-500/25"
                >
                    <Download className="w-4 h-4" />
                    Download JSON
                </button>
            )}
        </div>
    );
};

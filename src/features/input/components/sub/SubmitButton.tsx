import React, { useState, useEffect } from 'react';
import { Wand2 } from 'lucide-react';

interface SubmitButtonProps {
    onClick: () => void;
    isLoading: boolean;
    disabled: boolean;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({ onClick, isLoading, disabled }) => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (isLoading) {
            setProgress(0);
            const interval = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 95) return 95;
                    const increment = prev < 50 ? 5 : prev < 80 ? 2 : 1;
                    return prev + increment;
                });
            }, 500);
            return () => clearInterval(interval);
        } else {
            setProgress(100);
            const timer = setTimeout(() => setProgress(0), 500);
            return () => clearTimeout(timer);
        }
    }, [isLoading]);

    return (
        <button
            onClick={onClick}
            disabled={disabled || isLoading}
            className={`w-full py-4 rounded-xl font-bold text-base flex flex-col items-center justify-center gap-1 transition-all duration-300 shadow-lg ${isLoading || disabled ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hover:shadow-indigo-500/25'}`}
        >
            {isLoading ? (
                <>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="text-lg">分析中... {progress}%</span>
                    </div>
                    <div className="w-full max-w-sm mt-3 px-4">
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden relative">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5" />
                    <span>プロンプトを生成する</span>
                </div>
            )}
        </button>
    );
};

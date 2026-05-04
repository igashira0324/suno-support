import React from 'react';
import { ImageIcon, X, Upload, Loader2, Sparkles } from 'lucide-react';
import { AceStepState } from '../types';

interface ImageSectionProps {
    state: AceStepState;
    setState: React.Dispatch<React.SetStateAction<AceStepState>>;
    onAnalyze: () => void;
}

export const ImageSection: React.FC<ImageSectionProps> = ({ state, setState, onAnalyze }) => {
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setState(prev => ({ ...prev, imageFile: e.target.files![0] }));
        }
    };

    const clearImage = () => setState(prev => ({ ...prev, imageFile: null }));

    return (
        <div className="bg-slate-950/20 rounded-2xl p-1">
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative bg-slate-900 rounded-xl p-4 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Image Inspiration
                        </label>
                        {state.imageFile && (
                            <button onClick={clearImage} className="text-slate-500 hover:text-red-400 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className={`relative w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${state.imageFile ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'}`}>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                        {state.imageFile ? (
                            <>
                                <img src={URL.createObjectURL(state.imageFile)} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                                <div className="relative z-20 bg-slate-900/80 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-300 backdrop-blur-sm border border-indigo-500/30">
                                    {state.imageFile.name}
                                </div>
                            </>
                        ) : (
                            <div className="text-center space-y-1 pointer-events-none">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                                    <Upload className="w-4 h-4" />
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Upload Image</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onAnalyze}
                        disabled={!state.imageFile || state.isAnalyzing}
                        className={`w-full py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${!state.imageFile ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : state.isAnalyzing ? 'bg-indigo-600/50 text-indigo-200 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                    >
                        {state.isAnalyzing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...</> : <><Sparkles className="w-3.5 h-3.5" /> Analyze</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

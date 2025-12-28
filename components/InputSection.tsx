
import React, { useRef } from 'react';
import { MediaType, GenerationMode } from '../types';
import { Music, Image as ImageIcon, Video, X, Wand2, Mic2, MicOff, Sparkles } from 'lucide-react';

interface InputSectionProps {
  inputText: string;
  onTextChange: (text: string) => void;
  onFileSelect: (file: File | null, type: MediaType) => void;
  onSubmit: () => void;
  isLoading: boolean;
  mediaType: MediaType;
  mediaFile: File | null;
  generationMode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
}

const InputSection: React.FC<InputSectionProps> = ({
  inputText,
  onTextChange,
  onFileSelect,
  onSubmit,
  isLoading,
  mediaType,
  mediaFile,
  generationMode,
  onModeChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const modeOptions = [
    { value: GenerationMode.AUTO, label: '自動 (Auto)', icon: Sparkles },
    { value: GenerationMode.VOCAL, label: '歌あり (Vocal)', icon: Mic2 },
    { value: GenerationMode.INSTRUMENTAL, label: '歌なし (Inst)', icon: MicOff },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Music className="w-6 h-6 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">楽曲イメージ入力</h2>
        </div>
      </div>

      {/* Text Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          テーマ・YouTube URL・コンセプト
        </label>
        <textarea
          value={inputText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="例: https://www.youtube.com/watch?v=... この動画のような疾走感のある曲にしたい / ネオンの雨が降るサイバーパンク..."
          className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
        />
      </div>

      {/* File Input Area */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          画像・動画からインスピレーション (任意)
        </label>
        
        {!mediaFile ? (
          <div 
            onClick={triggerFileUpload}
            className="group border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/50 rounded-xl p-8 text-center cursor-pointer transition-all duration-300"
          >
            <div className="flex justify-center gap-4 mb-3">
              <div className="p-3 rounded-full bg-slate-900 group-hover:bg-indigo-950/50 transition-colors">
                <ImageIcon className="w-6 h-6 text-slate-500 group-hover:text-indigo-400" />
              </div>
              <div className="p-3 rounded-full bg-slate-900 group-hover:bg-pink-950/50 transition-colors">
                <Video className="w-6 h-6 text-slate-500 group-hover:text-pink-400" />
              </div>
            </div>
            <p className="text-sm text-slate-400 group-hover:text-slate-300">
              クリックして画像または動画をアップロード
            </p>
          </div>
        ) : (
          <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-700 group">
            <div className="absolute top-2 right-2 z-10">
              <button 
                onClick={handleClearFile}
                className="p-1.5 rounded-full bg-black/60 text-white hover:bg-red-500/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center p-4 gap-4">
               <div className="h-16 w-16 rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden">
                 {mediaType === MediaType.IMAGE ? (
                   <img src={URL.createObjectURL(mediaFile)} alt="Preview" className="w-full h-full object-cover" />
                 ) : (
                   <Video className="w-8 h-8 text-indigo-400" />
                 )}
               </div>
               <div>
                 <p className="text-sm font-medium text-white truncate max-w-[200px] sm:max-w-sm">
                   {mediaFile.name}
                 </p>
                 <p className="text-xs text-slate-500 mt-1">
                   {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                 </p>
               </div>
            </div>
          </div>
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,video/*"
          className="hidden"
        />
      </div>

      {/* Mode Selection */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          生成モード
        </label>
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = generationMode === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onModeChange(option.value)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isSelected
                    ? 'bg-slate-800 text-indigo-300 shadow-sm ring-1 ring-slate-700'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : ''}`} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={isLoading || (!inputText && !mediaFile)}
        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
          isLoading || (!inputText && !mediaFile)
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hover:shadow-indigo-500/25'
        }`}
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            動画・情報を分析中...
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5" />
            プロンプトを生成する
          </>
        )}
      </button>
    </div>
  );
};

export default InputSection;

import React, { useRef } from 'react';
import { useVocalStudio } from '../hooks/useVocalStudio';
import { VocalStudioHeader } from './sub/VocalStudioHeader';
import { VocalStudioUpload } from './sub/VocalStudioUpload';
import { VocalStudioSettings } from './sub/VocalStudioSettings';
import { VocalStudioProcess } from './sub/VocalStudioProcess';
import { VocalStudioResults } from './sub/VocalStudioResults';

export default function VocalStudioTab() {
    const { state, setState, handleFileSelect, handleGenerate, handleCancel } = useVocalStudio();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(e.target.files?.[0]);
    };

    return (
        <div className="w-full max-w-7xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <VocalStudioHeader />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Inputs */}
                <div className="space-y-6">
                    <VocalStudioUpload
                        fileInputRef={fileInputRef}
                        instrumentalFile={state.instrumentalFile}
                        instrumentalUrl={state.instrumentalUrl}
                        isProcessing={state.isProcessing}
                        onFileChange={onFileChange}
                    />

                    <VocalStudioSettings
                        guideInstrument={state.guideInstrument}
                        lyrics={state.lyrics}
                        isProcessing={state.isProcessing}
                        onInstrumentChange={(inst) => setState(prev => ({ ...prev, guideInstrument: inst }))}
                        onLyricsChange={(lyrics) => setState(prev => ({ ...prev, lyrics }))}
                    />
                </div>

                {/* Right Column: Processing & Output */}
                <div className="space-y-6">
                    <VocalStudioProcess
                        isProcessing={state.isProcessing}
                        status={state.status}
                        progress={state.progress}
                        error={state.error}
                        canGenerate={!!state.instrumentalFile && !!state.lyrics.trim()}
                        onGenerate={handleGenerate}
                        onCancel={handleCancel}
                    />

                    <VocalStudioResults
                        vocalUrl={state.vocalUrl}
                        mixUrl={state.mixUrl}
                    />
                </div>
            </div>
        </div>
    );
}

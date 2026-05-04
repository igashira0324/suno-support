export interface VocalStudioState {
    instrumentalFile: File | null;
    instrumentalUrl: string;
    lyrics: string;
    guideInstrument: 'piano' | 'guitar' | 'other' | 'vocals' | 'bass' | 'drums';
    isProcessing: boolean;
    progress: number;
    status: string;
    midiUrl: string | null;
    vocalUrl: string | null;
    mixUrl: string | null;
    error: string | null;
}

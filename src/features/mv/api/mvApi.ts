import { toApiUrl } from '../../../api/client';
import { CLAPSearchResponse, AudioAnalysis } from '../types';

export const mvApi = {
    separate: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(toApiUrl('/acestep/separate'), {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Failed to upload file');
        return response.json();
    },

    separateUrl: async (url: string) => {
        const response = await fetch(toApiUrl('/acestep/separate-url'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        if (!response.ok) throw new Error('Failed to start URL import');
        return response.json();
    },

    getTaskStatus: async (taskId: string) => {
        const response = await fetch(toApiUrl(`/task/${taskId}?t=${Date.now()}`));
        if (!response.ok) throw new Error('Task not found');
        return response.json();
    },

    cancelTask: async (taskId: string) => {
        return fetch(toApiUrl(`/task/${taskId}/cancel`), { method: 'POST' });
    },

    analyzeAudio: async (filePath: string): Promise<AudioAnalysis> => {
        const response = await fetch(toApiUrl('/acestep/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath })
        });
        if (!response.ok) throw new Error('Analysis failed');
        return response.json();
    },

    clapSearch: async (filePath: string, query: string): Promise<CLAPSearchResponse> => {
        const response = await fetch(toApiUrl('/acestep/clap/search'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: filePath,
                query: query,
                window_sec: 5.0,
                top_k: 5
            })
        });
        if (!response.ok) throw new Error('CLAP search failed');
        return response.json();
    },

    getClapPresets: async () => {
        const response = await fetch(toApiUrl('/acestep/clap/presets'));
        if (!response.ok) throw new Error('Failed to load CLAP presets');
        return response.json();
    },

    voiceConvert: async (params: {
        instrumental_url: string;
        vocals_url: string;
        original_url?: string;
        reference_audio: File;
        diffusion_steps: number;
        pitch_shift: number;
        f0_condition: boolean;
        auto_f0_adjust: boolean;
    }) => {
        const formData = new FormData();
        formData.append('instrumental_url', params.instrumental_url);
        formData.append('vocals_url', params.vocals_url);
        if (params.original_url) {
            formData.append('original_url', params.original_url);
        }
        formData.append('reference_audio', params.reference_audio);
        formData.append('diffusion_steps', params.diffusion_steps.toString());
        formData.append('pitch_shift', params.pitch_shift.toString());
        formData.append('f0_condition', params.f0_condition.toString());
        formData.append('auto_f0_adjust', params.auto_f0_adjust.toString());

        const response = await fetch(toApiUrl('/acestep/voice-convert'), {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Conversion failed to start');
        return response.json();
    },

    trimAudio: async (filePath: string, start: number, end: number) => {
        const formData = new FormData();
        formData.append('file_path', filePath);
        formData.append('start_time', start.toString());
        formData.append('end_time', end.toString());

        const response = await fetch(toApiUrl('/files/trim'), {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
    }
};

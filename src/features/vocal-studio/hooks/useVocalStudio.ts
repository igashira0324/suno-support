import { useState, useRef, useEffect } from 'react';
import { VocalStudioState } from '../types';
import { toApiUrl } from '../../../api/client';
import { aceStepApi } from '../../acestep/api/aceStepApi';

const initialVocalStudioState: VocalStudioState = {
    instrumentalFile: null,
    instrumentalUrl: '',
    lyrics: '',
    guideInstrument: 'other',
    isProcessing: false,
    progress: 0,
    status: '',
    midiUrl: null,
    vocalUrl: null,
    mixUrl: null,
    error: null,
};

export const useVocalStudio = () => {
    const [state, setState] = useState<VocalStudioState>(initialVocalStudioState);
    const timeoutRef = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const clearPolling = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const handleFileSelect = (file: File | undefined) => {
        if (file) {
            const url = URL.createObjectURL(file);
            setState(prev => ({ ...prev, instrumentalFile: file, instrumentalUrl: url, error: null }));
        }
    };

    const handleGenerate = async () => {
        if (!state.instrumentalFile) {
            setState(prev => ({ ...prev, error: "Please upload an instrumental file." }));
            return;
        }
        if (!state.lyrics.trim()) {
            setState(prev => ({ ...prev, error: "Please enter lyrics." }));
            return;
        }

        clearPolling();
        setState(prev => ({ 
            ...prev, 
            isProcessing: true, 
            error: null, 
            status: 'アップロード中...', 
            progress: 10,
            midiUrl: null,
            vocalUrl: null,
            mixUrl: null
        }));

        try {
            // Step 1: Upload file
            const uploadRes = await aceStepApi.uploadSource(state.instrumentalFile);
            const filePath = uploadRes.path;

            setState(prev => ({ ...prev, status: 'タスクを予約中...', progress: 20 }));

            // Step 2: Start SVS Task
            const startRes = await fetch(toApiUrl('/svs/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_url: filePath,
                    instrument: state.guideInstrument,
                    lyrics: state.lyrics
                })
            });

            if (!startRes.ok) {
                const err = await startRes.json();
                throw new Error(err.detail || "タスク開始に失敗しました");
            }

            const { task_id } = await startRes.json();
            
            // Step 3: Polling status
            const pollStatus = async () => {
                try {
                    const statusRes = await fetch(toApiUrl(`/svs/status/${task_id}`));
                    if (!statusRes.ok) throw new Error("ステータス取得に失敗しました");
                    
                    const task = await statusRes.json();
                    
                    if (task.status === 'completed') {
                        setState(prev => ({ 
                            ...prev, 
                            isProcessing: false, 
                            progress: 100, 
                            status: '生成完了！',
                            midiUrl: task.result.midi_url ? toApiUrl(task.result.midi_url) : null,
                            vocalUrl: task.result.vocal_url ? toApiUrl(task.result.vocal_url) : null,  
                            mixUrl: task.result.mix_url ? toApiUrl(task.result.mix_url) : null       
                        }));
                        timeoutRef.current = null;
                    } else if (task.status === 'error') {
                        throw new Error(task.error || "生成タスク中にエラーが発生しました");
                    } else {
                        setState(prev => ({ 
                            ...prev, 
                            status: task.status === 'queued' ? '待機中...' :
                                    task.status === 'separating' ? '楽器分離中...' : 
                                    task.status === 'midi_conversion' ? 'MIDI変換中...' :
                                    task.status === 'vocal_synthesis' ? 'ボーカル合成中...' :
                                    task.status === 'mixing' ? '最終ミックス中...' : 
                                    task.status === 'processing' ? '処理中...' : '処理中...',
                            progress: task.progress 
                        }));
                        // Poll again in 2 seconds
                        timeoutRef.current = setTimeout(pollStatus, 2000);
                    }
                } catch (e: any) {
                    setState(prev => ({ 
                        ...prev, 
                        isProcessing: false, 
                        error: e.message || "ポーリング中にエラーが発生しました" 
                    }));
                    timeoutRef.current = null;
                }
            };

            timeoutRef.current = setTimeout(pollStatus, 2000);

        } catch (err: any) {
            setState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                error: err.message || "エラーが発生しました。"
            }));
            timeoutRef.current = null;
        }
    };

    return {
        state,
        setState,
        handleFileSelect,
        handleGenerate
    };
};

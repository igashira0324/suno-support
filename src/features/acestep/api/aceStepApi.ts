import { apiClient } from '../../../api/client';
import { AceStepState } from '../types';

export const aceStepApi = {
  /**
   * Start ACE-Step generation task
   */
  generate: async (state: Partial<AceStepState> & { src_audio_path?: string | null, reference_audio_path?: string | null }) => {
    // P1-1: Convert camelCase to snake_case for backend compatibility
    const params = {
      prompt: state.prompt,
      lyrics: state.lyrics,
      thinking: state.thinking,
      inference_steps: state.inference_steps,
      guidance_scale: state.guidance_scale,
      use_random_seed: state.useRandomSeed,
      seed: state.seed,
      batch_size: state.batch_size,
      duration: state.duration,
      language: state.language,
      model: state.model,
      sample_mode: state.sample_mode,
      sample_query: state.sample_query,
      task_type: state.task_type,
      audio_cover_strength: state.audio_cover_strength,
      repainting_start: state.repainting_start,
      repainting_end: state.repainting_end,
      src_audio_path: state.src_audio_path,
      use_adg: state.useAdg,
      reference_audio_path: state.reference_audio_path,
      track_name: state.legoTrackName,
      shift: state.shift,
      infer_method: state.infer_method,
      bpm: state.bpm ?? null,
      key_scale: state.keyScale || null,
      time_signature: state.timeSignature || null,
    };

    return apiClient.post<{ task_id: string }>('/acestep/generate', params);
  },

  /**
   * Analyze an audio source's BPM / key / duration (for metadata locking)
   */
  analyzeProfile: async (params: { audio_path?: string; url?: string }) => {
    return apiClient.post<{ bpm: number | null; key_scale: string | null; duration: number | null }>(
      '/acestep/analyze-profile', params
    );
  },

  /**
   * Get status of an ACE-Step task
   */
  getStatus: async (taskId: string) => {
    return apiClient.get<any>(`/acestep/status/${taskId}`);
  },

  /**
   * Upload source audio for ACE-Step
   */
  uploadSource: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload<{ path: string }>('/acestep/upload-source', formData);
  },

  /**
   * Download audio from URL
   */
  downloadUrl: async (url: string) => {
    return apiClient.post<{ path: string }>('/acestep/download-url', { url });
  },

  /**
   * Extract lyrics from URL or audio path
   */
  extractLyrics: async (params: { url?: string; audio_path?: string; language?: string }) => {
    return apiClient.post<{ lyrics: string; prompt?: string; method: string }>('/acestep/extract-lyrics', params);
  },

  /**
   * Proxy LLM request
   */
  llmProxy: async (body: any) => {
    return apiClient.post<any>('/acestep/llm-proxy', body);
  },

  /**
   * Generate music with MiniMax (Secondary)
   */
  generateMinimax: async (lyrics: string, prompt: string) => {
    return apiClient.post<any>('/acestep/minimax/generate', { lyrics, prompt });
  },

  /**
   * Post-process (Fade/Trim) audio
   */
  postProcess: async (params: { file_url: string; fade_duration: number; auto_trim: boolean }) => {
    return apiClient.post<any>('/acestep/post-process', params);
  },

  /**
   * Start separation (for Voice Change)
   */
  separate: async (fileUrl: string) => {
    // P0-1: Use separate-url for JSON payload compatibility
    return apiClient.post<{ task_id: string }>('/acestep/separate-url', { file_url: fileUrl });
  },

  /**
   * Start voice conversion task
   */
  voiceConvert: async (formData: FormData) => {
    return apiClient.upload<{ task_id: string }>('/acestep/voice-convert', formData);
  },

  /**
   * Add AI vocals to an instrumental while preserving the original instrumental exactly.
   * Returns a task_id polled via getTaskStatus (/task/{id}).
   */
  generateVocalsOverlay: async (params: {
    instrumental_url: string;
    prompt: string;
    lyrics: string;
    language: string;
    audio_cover_strength: number;
    vocal_gain: number;
    master: boolean;
    inference_steps: number;
    guidance_scale: number;
    shift: number;
    infer_method: string;
    seed: number;
  }) => {
    return apiClient.post<{ task_id: string }>('/acestep/generate-vocals-overlay', params);
  },

  /**
   * Get generic task status
   */
  getTaskStatus: async (taskId: string) => {
    return apiClient.get<any>(`/task/${taskId}`);
  },
  
  /**
   * Check ACE-Step health/readiness
   */
  health: async () => {
    return apiClient.get<any>('/acestep/health');
  }
};


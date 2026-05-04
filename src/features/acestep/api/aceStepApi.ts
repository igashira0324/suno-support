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
    };
    
    return apiClient.post<{ task_id: string }>('/acestep/generate', params);
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
    // P0-4: Backend expects file_url
    return apiClient.post<{ task_id: string }>('/acestep/separate', { file_url: fileUrl });
  },

  /**
   * Get generic task status
   */
  getTaskStatus: async (taskId: string) => {
    return apiClient.get<any>(`/task/${taskId}`);
  },

  /**
   * Start separation from URL (generated file)
   */
  separateGenerated: async (fileUrl: string) => {
    return apiClient.post<{ task_id: string }>('/acestep/separate-generated', { file_url: fileUrl });
  },

  /**
   * Save file to results
   */
  saveFile: async (fileUrl: string, title?: string, theme?: string) => {
    return apiClient.post<any>('/acestep/save_file', { file_url: fileUrl, title, theme });
  }
};

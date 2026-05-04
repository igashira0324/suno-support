import { apiClient } from '../../../api/client';
import { AceStepState } from '../types';

export const aceStepApi = {
  /**
   * Start ACE-Step generation task
   */
  generate: async (params: Partial<AceStepState>) => {
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
  postProcess: async (fileUrl: string, options: { fade_duration: number; auto_trim: boolean }) => {
    return apiClient.post<any>('/acestep/post-process', {
      file_url: fileUrl,
      ...options
    });
  },

  /**
   * Start separation (for Voice Change)
   */
  separateGenerated: async (fileUrl: string) => {
    return apiClient.post<{ task_id: string }>('/separate-generated', { file_url: fileUrl });
  },

  /**
   * Save file to results
   */
  saveFile: async (fileUrl: string, title?: string, theme?: string) => {
    return apiClient.post<any>('/save_file', { file_url: fileUrl, title, theme });
  }
};

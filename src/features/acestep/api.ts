import apiClient from '../../api/client';
import { AceStepState } from './types';

export const acestepApi = {
  generate: async (params: Partial<AceStepState>) => {
    return apiClient.post('/acestep/generate', params);
  },
  
  getStatus: async (taskId: string) => {
    return apiClient.get(`/acestep/status/${taskId}`);
  },
  
  separate: async (fileUrl: string) => {
    return apiClient.post('/acestep/separate', { file_url: fileUrl });
  },
  
  voiceConvert: async (formData: FormData) => {
    return apiClient.upload('/acestep/voice-convert', formData);
  },
  
  extractLyrics: async (url: string) => {
    return apiClient.post('/acestep/extract-lyrics', { url });
  },

  uploadSource: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.upload('/acestep/upload-source', formData);
  },

  downloadUrl: async (url: string) => {
    return apiClient.post('/acestep/download-url', { url });
  },

  postProcess: async (params: { file_url: string, fade_duration: number, auto_trim: boolean }) => {
    return apiClient.post('/acestep/post-process', params);
  },

  getTaskStatus: async (taskId: string) => {
    return apiClient.get(`/task/${taskId}`);
  }
};

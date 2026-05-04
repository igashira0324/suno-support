/**
 * Suno Architect API Client
 * Centralized API client for all backend communication.
 * Handles base URL configuration and provides common request patterns.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8100';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API request failed with status ${response.status}`);
    }

    return response.json();
  }

  // GET requests
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST requests
  async post<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Multipart/Form-data (File uploads)
  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      // Note: We don't set Content-Type header here, let the browser set it with the boundary
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
    }

    return response.json();
  }

  // Task Status Polling helper
  async pollTask<T>(taskId: string, interval = 2000, maxAttempts = 300): Promise<T> {
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.get<any>(`/task/${taskId}`);
          
          if (status.status === 'completed') {
            resolve(status);
            return;
          }
          
          if (status.status === 'failed') {
            reject(new Error(status.error || 'Task failed'));
            return;
          }
          
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Task polling timed out'));
            return;
          }
          
          setTimeout(poll, interval);
        } catch (error) {
          reject(error);
        }
      };
      
      poll();
    });
  }
}

export const toApiUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;

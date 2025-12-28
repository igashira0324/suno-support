
export enum MediaType {
  NONE = 'NONE',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export enum GenerationMode {
  AUTO = 'AUTO',
  VOCAL = 'VOCAL',
  INSTRUMENTAL = 'INSTRUMENTAL'
}

export type GeminiModel = 'gemini-3-flash-preview' | 'gemini-2.0-flash' | 'gemini-2.5-flash';

export type SearchEngine = 'google-grounding' | 'google-custom' | 'tavily' | 'none';

export interface SongSelection {
  title: string;
  style: string;
  instrumental: boolean;
  content: string;
  comment?: string;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface SunoResponse {
  analysis: string;
  titleCandidates: string[];
  styleCandidates: string[];
  bestSelection: SongSelection;
  alternativeSelection: SongSelection;
  sources?: GroundingSource[];
}

export interface AppState {
  inputText: string;
  mediaFile: File | null;
  mediaType: MediaType;
  generationMode: GenerationMode;
  isLoading: boolean;
  result: SunoResponse | null;
  error: string | null;
  searchEngine: SearchEngine;
  modelName: GeminiModel;
  enableVideoAnalysis: boolean;
}

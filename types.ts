
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
}

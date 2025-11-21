export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}

export enum ARMode {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  CHATTING = 'CHATTING',
  LIVE = 'LIVE',
}

export interface AnalysisResult {
  text: string;
  relatedLinks?: { title: string; url: string }[];
}
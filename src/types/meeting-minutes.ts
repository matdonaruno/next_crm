export interface MeetingType {
  id: string;
  name: string;
  description?: string;
  facility_id: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingMinute {
  id: string;
  meeting_type_id: string;
  title: string;
  meeting_date: string;
  recorded_by: string;
  facility_id: string;
  department_id?: string;
  attendees: string[];
  content?: string;
  summary?: string;
  audio_file_path?: string;
  is_transcribed: boolean;
  keywords: string[];
  created_at: string;
  updated_at: string;
  segments?: string | any;  // JSON文字列またはオブジェクト
  speakers?: string | any;  // JSON文字列またはオブジェクト
  meeting_types?: {
    id: string;
    name: string;
  };
  transcription?: string;
  audio_url?: string;
}

export interface MeetingMinuteFormData {
  meeting_type_id: string;
  title: string;
  meeting_date: string;
  department_id?: string;
  attendees: string[];
  content?: string;
}

export interface AudioRecordingData {
  audioBlob: Blob;
  duration: number;
  filename: string;
}

export interface TranscriptionResult {
  text: string;
  summary?: string;
  keywords?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SearchResult {
  id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  relevance: number;
  snippet: string;
} 
import { ChatMessage, TranscriptionResult } from '@/types/meeting-minutes';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * 音声ファイルを文字起こしする関数
 * @param audioFile 音声ファイル
 * @returns 文字起こしされたテキスト
 */
export async function transcribeAudio(audioFile: File): Promise<string> {
  // サーバーサイドAPIを使用
  const formData = new FormData();
  formData.append('file', audioFile);

  // Supabaseクライアントの初期化
  const supabase = createClientComponentClient();
  
  // セッションからトークンを取得
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  
  if (!token) {
    throw new Error('認証トークンが取得できません。ログインしてください。');
  }
  
  const response = await fetch('/api/meeting-minutes/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API error: ${error.error || error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.text;
}

/**
 * テキストを要約し、キーワードを抽出する関数
 * @param text 要約するテキスト
 * @returns 要約とキーワード
 */
export async function summarizeText(text: string): Promise<TranscriptionResult> {
  // サーバーサイドAPIを使用
  // Supabaseクライアントの初期化
  const supabase = createClientComponentClient();
  
  // セッションからトークンを取得
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  
  if (!token) {
    throw new Error('認証トークンが取得できません。ログインしてください。');
  }

  const response = await fetch('/api/meeting-minutes/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API error: ${error.error || error.message || 'Unknown error'}`);
  }

  const result = await response.json();

  return {
    text,
    summary: result.summary,
    keywords: result.keywords
  };
}

/**
 * 会議議事録データに対する質問に回答する関数
 * @param prompt ユーザーからの質問
 * @param context 会議議事録データのコンテキスト
 * @returns AIの回答
 */
export async function searchMeetings(prompt: string, context?: string): Promise<string> {
  // Supabaseクライアントの初期化
  const supabase = createClientComponentClient();
  
  // セッションからトークンを取得
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  
  if (!token) {
    throw new Error('認証トークンが取得できません。ログインしてください。');
  }

  const response = await fetch('/api/meeting-minutes/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: prompt,
      context
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API error: ${error.error || error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.results ? JSON.stringify(data.results) : '';
} 
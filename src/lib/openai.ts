import { ChatMessage, TranscriptionResult } from '@/types/meeting-minutes';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

/**
 * 音声ファイルを文字起こしする関数
 * @param audioFile 音声ファイル
 * @returns 文字起こしされたテキスト
 */
export async function transcribeAudio(audioFile: File): Promise<string> {
  console.log('文字起こし開始 - ファイル:', audioFile.name, 'サイズ:', (audioFile.size / (1024 * 1024)).toFixed(2), 'MB');
  
  // サーバーサイドAPIを使用
  const formData = new FormData();
  formData.append('file', audioFile);

  // Supabaseクライアントの初期化
  const supabase = createClientComponentClient();
  
  // セッションからトークンを取得
  console.log('認証セッション取得中...');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  
  if (!token) {
    console.error('認証エラー: トークンがありません');
    throw new Error('認証トークンが取得できません。ログインしてください。');
  }
  
  console.log('認証トークン取得済み、文字起こしAPIリクエスト送信中...');
  
  // タイムアウト処理を実装
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3分タイムアウト
  
  try {
    const response = await fetch('/api/meeting-minutes/transcribe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId); // タイムアウトをクリア
    
    console.log('APIレスポンス受信:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorDetail = '';
      try {
        const error = await response.json();
        errorDetail = error.error || error.message || '不明なエラー';
      } catch (e) {
        errorDetail = `HTTPエラー: ${response.status} ${response.statusText}`;
      }
      
      console.error('文字起こしAPIエラー:', errorDetail);
      throw new Error(`API error: ${errorDetail}`);
    }

    const data = await response.json();
    console.log('文字起こし完了 - テキスト長:', data.text?.length || 0, '文字');
    return data.text;
  } catch (error) {
    // AbortControllerによるタイムアウトエラーを検出
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('文字起こしタイムアウト: リクエストが3分以内に完了しませんでした');
      throw new Error('文字起こし処理がタイムアウトしました。ファイルサイズが大きすぎるか、サーバーが混雑しています。');
    }
    
    // その他のネットワークエラー
    console.error('文字起こし処理エラー:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId); // 念のため、タイムアウトを確実にクリア
  }
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
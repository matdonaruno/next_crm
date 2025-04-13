import { ChatMessage, TranscriptionResult } from '@/types/meeting-minutes';

// 環境変数からAPIキーを取得
const API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1';

/**
 * 音声ファイルを文字起こしする関数
 * @param audioFile 音声ファイル
 * @returns 文字起こしされたテキスト
 */
export async function transcribeAudio(audioFile: File): Promise<string> {
  if (!API_KEY) {
    throw new Error('OpenAI API key is not set');
  }

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-1');
  formData.append('language', 'ja');

  const response = await fetch(`${API_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
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
  if (!API_KEY) {
    throw new Error('OpenAI API key is not set');
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '会議議事録の内容を要約し、重要なキーワードを抽出してください。要約は300文字以内で、キーワードは10個程度抽出してください。JSONフォーマットで返してください。'
    },
    {
      role: 'user',
      content: text
    }
  ];

  const response = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

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
  if (!API_KEY) {
    throw new Error('OpenAI API key is not set');
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '会議議事録データを検索して、関連する情報を提供してください。具体的な日付や会議名、議題などを含めて回答してください。'
    },
    {
      role: 'user',
      content: `検索クエリ: ${prompt}\n${context ? `コンテキスト: ${context}` : ''}`
    }
  ];

  const response = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.5,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
} 
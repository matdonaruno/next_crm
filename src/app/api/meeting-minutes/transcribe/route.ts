import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // APIキーの確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('API: OpenAIのAPIキーが設定されていません');
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。サーバー環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
    }

    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    // マルチパートフォームデータの処理
    const formData = await request.formData();
    const audioFile = formData.get('file');
    
    // オーディオファイルの確認
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: '音声ファイルが必要です' }, { status: 400 });
    }

    console.log(`API: 音声ファイル "${audioFile.name}" (${audioFile.size} バイト) の文字起こしを開始`);
    
    // OpenAI Whisper APIを使って文字起こし
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "ja",
      response_format: "text"
    });

    console.log('API: 文字起こし成功');
    
    // 文字起こし結果を返す
    return NextResponse.json({ 
      text: transcription 
    });
    
  } catch (error) {
    console.error('API: 文字起こしエラー:', error);
    
    // OpenAI APIキーが設定されていない場合のエラーメッセージ
    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: '内部サーバーエラー',
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    }, { status: 500 });
  }
} 
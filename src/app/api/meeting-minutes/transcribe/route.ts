import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  console.log('API: 文字起こしリクエスト受信');
  
  try {
    // APIキーの確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('API: OpenAIのAPIキーが設定されていません');
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。サーバー環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
    } else {
      console.log('API: OpenAIのAPIキーが設定されています');
    }

    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    console.log('API: 認証ヘッダー:', authHeader ? 'あり' : 'なし');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    console.log('API: Supabaseセッション確認中...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ 
        error: '認証セッションエラー',
        message: sessionError.message
      }, { status: 401 });
    }
    
    if (!session) {
      console.error('API: セッションがnullです');
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }
    
    console.log('API: 認証済みユーザー:', session.user.id);

    // マルチパートフォームデータの処理
    let formData;
    try {
      formData = await request.formData();
    } catch (formError) {
      console.error('API: フォームデータの解析エラー:', formError);
      return NextResponse.json({ 
        error: 'フォームデータの解析に失敗しました', 
        message: formError instanceof Error ? formError.message : '不明なエラー'
      }, { status: 400 });
    }
    
    const audioFile = formData.get('file');
    
    // オーディオファイルの確認
    if (!audioFile || !(audioFile instanceof File)) {
      console.error('API: 音声ファイルがありません');
      return NextResponse.json({ error: '音声ファイルが必要です' }, { status: 400 });
    }

    console.log(`API: 音声ファイル "${audioFile.name}" (${audioFile.size} バイト) の文字起こしを開始`);
    
    // OpenAI Whisper APIを使って文字起こし
    try {
      console.log('API: OpenAI Whisper APIリクエスト送信中...');
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "ja",
        response_format: "text"
      });

      console.log('API: 文字起こし成功 - テキスト長:', transcription?.length || 0, '文字');
      
      // 文字起こし結果を返す
      return NextResponse.json({ 
        text: transcription 
      });
    } catch (whisperError) {
      console.error('API: OpenAI Whisper APIエラー:', whisperError);
      
      // OpenAIのエラーをクライアントに返す
      const errorMessage = whisperError instanceof Error ? whisperError.message : '不明なエラー';
      
      return NextResponse.json({ 
        error: 'Whisper APIエラー',
        message: errorMessage
      }, { status: 500 });
    }
    
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
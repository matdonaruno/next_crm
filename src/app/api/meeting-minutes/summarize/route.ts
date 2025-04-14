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

    // リクエストボディの解析
    const body = await request.json();
    const { text } = body;
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: '要約するテキストが必要です' }, { status: 400 });
    }

    console.log('API: テキストの要約処理を開始');
    
    // OpenAI GPT-4を使って要約と情報抽出
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: '会議議事録の内容を要約し、重要なキーワードを抽出してください。要約は300文字以内で、キーワードは10個程度抽出してください。JSONフォーマットで返してください。'
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    // レスポンスからJSONを抽出
    const content = response.choices[0].message.content;
    const result = content ? JSON.parse(content) : null;
    
    if (!result) {
      return NextResponse.json({ error: '要約の生成に失敗しました' }, { status: 500 });
    }

    console.log('API: 要約生成成功');
    
    return NextResponse.json({
      text: text,
      summary: result.summary,
      keywords: result.keywords
    });
    
  } catch (error) {
    console.error('API: 要約生成エラー:', error);
    
    // OpenAI APIキーが設定されていない場合のエラーメッセージ
    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
    }
    
    // JSONパースエラーの場合
    if (error instanceof SyntaxError) {
      return NextResponse.json({ 
        error: 'APIからの応答を解析できませんでした',
        message: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: '内部サーバーエラー',
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    }, { status: 500 });
  }
} 
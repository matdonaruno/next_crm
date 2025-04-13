import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 会議議事録の要約生成API
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    
    // APIキーが設定されているか確認
    if (!process.env.OPENAI_API_KEY) {
      console.error('API: OpenAIのAPIキーが設定されていません');
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。サーバー環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
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
    const content = body.content;
    
    if (!content) {
      return NextResponse.json({ error: '要約する内容が提供されていません' }, { status: 400 });
    }

    console.log(`API: 議事録ID ${id} の要約を生成します`);

    // OpenAIを使用して要約を生成
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "あなたは会議の内容を簡潔かつ正確に要約する専門家です。重要なポイント、決定事項、アクションアイテムなどを抽出して、わかりやすく整理してください。"
        },
        {
          role: "user",
          content: `以下の会議の内容を300字程度で要約してください。重要な決定事項とアクションアイテムを含めてください。\n\n${content}`
        }
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    const summary = response.choices[0]?.message?.content || "要約の生成に失敗しました。";
    
    // 生成された要約をデータベースに保存
    const { data, error } = await supabase
      .from('meeting_minutes')
      .update({ summary })
      .eq('id', id)
      .select('id, summary')
      .single();

    if (error) {
      console.error(`API: 議事録ID ${id} の要約保存エラー:`, error);
      // 要約は生成できたが保存に失敗した場合は、要約だけ返す
      return NextResponse.json(
        { summary, error: 'データベースへの保存に失敗しました', details: error }, 
        { status: 200 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    
    // OpenAI APIキーが設定されていない場合のエラーメッセージ
    if (error instanceof Error && error.message.includes('API key')) {
      return NextResponse.json({ 
        error: 'OpenAI APIキーが設定されていません。環境変数OPENAI_API_KEYを確認してください。' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
} 
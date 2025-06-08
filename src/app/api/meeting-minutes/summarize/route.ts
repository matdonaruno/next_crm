// src/app/api/meeting-minutes/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type SummaryResp = { summary: string; keywords: string[] };

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    console.log('[summarize] === 要約API開始 ===');
    
    /* 1) Authorization ヘッダーからアクセストークンを取得して Supabase クライアントを生成 */
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    console.log('[summarize] 認証情報確認', {
      hasAuthHeader: !!authHeader,
      authHeaderValue: authHeader,
      tokenLength: token.length,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      tokenPrefix: token.substring(0, 10),
      serviceKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)
    });

    if (!token) {
      console.error('[summarize] トークンが空です');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // サービスロールキーかユーザートークンかを判定
    const isServiceRole = token === process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('[summarize] 認証タイプ判定', { isServiceRole });
    
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      isServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY! : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      isServiceRole ? {} : { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    /* 認証ユーザー確認（サービスロールの場合はスキップ） */
    if (!isServiceRole) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    /* 2) 本文取得 & バリデーション */
    const raw = (await request.json()) as unknown;
    if (typeof raw !== 'object' || raw === null)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    
    const { text, meetingMinuteId } = raw as { text?: string; meetingMinuteId?: string };
    
    // meetingMinuteIdが指定された場合は、DBから取得
    let finalText = text;
    if (meetingMinuteId) {
      const { data: minute, error } = await supabase
        .from('meeting_minutes')
        .select('segments')
        .eq('id', meetingMinuteId)
        .single();

      if (error || !minute) {
        return NextResponse.json({ error: '議事録が見つかりません' }, { status: 404 });
      }

      if (minute.segments && Array.isArray(minute.segments)) {
        finalText = minute.segments
          .map((seg: any) => seg.text)
          .filter(Boolean)
          .join('\n');
      }
    }
    
    if (typeof finalText !== 'string' || !finalText.trim())
      return NextResponse.json({ error: 'text が必要です (または meetingMinuteId)' }, { status: 400 });

    /* 3) GPT-4o で要約＋キーワード抽出（JSON 返却） */
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-4o',
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'あなたは熟練した議事録要約者です。以下の議事録を日本語で要約し、重要キーワードを最大10件抽出してください。要約は以下の形式で出力してください：\n\n【主要な議題・要素】\n• 議題1\n• 議題2\n• 議題3\n\n【詳細要約】\n（300文字以内で詳細な要約）\n\n必ず {"summary": "上記の形式での要約", "keywords": ["キーワード1", "キーワード2", ...]} の JSON 形式で回答してください。',
        },
        { role: 'user', content: finalText },
      ],
    });

    let parsed: SummaryResp;
    try {
      parsed = JSON.parse(res.choices[0].message.content ?? '');
    } catch {
      parsed = { summary: res.choices[0].message.content ?? '', keywords: [] };
    }

    // meetingMinuteIdが指定された場合は、DBに要約を保存
    if (meetingMinuteId && parsed.summary) {
      const { error: updateError } = await supabase
        .from('meeting_minutes')
        .update({
          summary: parsed.summary,
          keywords: parsed.keywords,
          processing_status: 'done'
        })
        .eq('id', meetingMinuteId);

      if (updateError) {
        console.error('[summarize] 要約保存エラー', updateError);
        return NextResponse.json({ error: '要約の保存に失敗しました' }, { status: 500 });
      }
    }

    return NextResponse.json<SummaryResp>(parsed, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e: any) {
    console.error('[minutes][summarize] error:', {
      name: e.name,
      message: e.message,
      stack: e.stack,
    });
    return NextResponse.json(
      { error: e.message || '内部サーバーエラー' },
      { status: 500 },
    );
  }
}

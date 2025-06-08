// src/app/api/meeting-minutes/[id]/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type SummaryResp = { id: string; summary: string };

export const dynamic = 'force-dynamic'; // 🍪 を使うので動的に

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params; // params は Promise ではないのでそのまま

  /* 1) Service‑role 認証（Authorization: Bearer <SERVICE_ROLE_KEY>） */
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 });
  }
  const serviceKey = authHeader.replace('Bearer ', '').trim();

  // Service Role Key で Supabase クライアントを生成（cookie 不要）
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  /* 2) 本文解析 */
  let content: unknown;
  try {
    const raw = await req.json();
    if (typeof raw !== 'object' || raw === null) {
      return NextResponse.json({ error: 'invalid_json', stage: 'validation' }, { status: 400 });
    }
    content = (raw as { content?: unknown }).content;
  } catch (e) {
    console.error('[summarize] json_parse error:', e);
    return NextResponse.json({ error: 'json_parse_error', stage: 'validation' }, { status: 400 });
  }
  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content_required', stage: 'validation' }, { status: 400 });
  }

  /* 3) OpenAI 要約（テキストを渡す） */
  let summary: string;
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_SUMMARY_MODEL ?? 'gpt-4o',
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'あなたは熟練の議事録要約者です。会議内容を300文字以内で簡潔に要約し、JSON形式で返してください。',
        },
        { role: 'user', content: content as string },
      ],
    });
    summary = completion.choices[0]?.message?.content ?? '';
  } catch (e) {
    console.error('[summarize] openai error:', e);
    return NextResponse.json({ error: 'openai_error', stage: 'openai' }, { status: 500 });
  }

  /* 4) 保存 */
  let updateErr;
  try {
    const updateRes = await supabase
      .from('meeting_minutes')
      .update({ summary })
      .eq('id', id)
      .select();
    updateErr = updateRes.error;
  } catch (e) {
    console.error('[summarize] db_update error:', e);
    return NextResponse.json({ error: 'db_update_error', stage: 'db_update' }, { status: 500 });
  }
  if (updateErr) {
    console.error('[summarize] updateErr:', updateErr);
    // 要約は返すが保存に失敗した場合
    return NextResponse.json(
      { id, summary, warn: 'save_failed', details: updateErr.message } as SummaryResp,
      { status: 200 }
    );
  }
  return NextResponse.json<SummaryResp>({ id, summary }, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
// src/app/api/meeting-minutes/route.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;


import { z } from 'zod';
import type { Database } from '@/types/supabase';

// Use the full Supabase row type for meeting_minutes
type MeetingMinute = Database['public']['Tables']['meeting_minutes']['Row'];

// Zodスキーマ定義
const meetingSchema = z.object({
  title: z.string().min(1),
  meeting_date: z.string(),
  content: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional().nullable(),
  meeting_type_id: z.string().uuid().optional().nullable(),
});

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    //console.log('[API GET meeting-minutes] Cookie header:', req.headers.get('cookie'));
    const supabase = createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        cookies: {
          // クッキーを読むだけ（更新は行わない）
          async getAll() {
            return req.cookies.getAll().map(c => ({
              name: c.name,
              value: c.value,
              options: {},
            }))
          },
          // 書き込みは今回はスキップ
          setAll() {},
        },
      },
    );
    // 認証チェック（RLS で facility_id を見ます）
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    console.log('[API GET meeting-minutes] user:', user, 'userErr:', userErr);
    if (userErr || !user) {
      console.warn('[API GET meeting-minutes] 401 Unauthorized');
      return NextResponse.json({ error: '認証情報が無効です' }, { status: 401 });
    }
    // 追加: プロファイル取得
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', user.id as unknown as string)
      .maybeSingle();

    console.log('[API GET meeting-minutes] profile:', profile, 'profileErr:', profileErr);

    if (profileErr || !profile || !profile.facility_id) {
      return NextResponse.json(
        { error: 'プロファイル取得に失敗しました' },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from('meeting_minutes')
      .select(`
        *,
        meeting_types(name)
      `)
      .eq('facility_id', profile.facility_id)
      .order('meeting_date', { ascending: false });

    // 作成者情報を別途取得してマッピング
    if (data && data.length > 0) {
      const creatorIds = [...new Set(data.map(item => item.recorded_by).filter(Boolean))];
      
      if (creatorIds.length > 0) {
        const { data: creators, error: creatorsError } = await supabase
          .from('profiles')
          .select('id, fullname')
          .in('id', creatorIds);

        if (!creatorsError && creators) {
          const creatorMap = creators.reduce((acc, creator) => {
            acc[creator.id] = creator.fullname;
            return acc;
          }, {} as Record<string, string>);

          // データに作成者名を追加
          data.forEach(item => {
            if (item.recorded_by) {
              (item as any).recorded_by_profile = { name: creatorMap[item.recorded_by] || '不明' };
            }
          });
        }
      }
    }

    if (error) {
      console.error('API GET meeting_minutes error:', error);
      return NextResponse.json({ error: 'データ取得に失敗しました' }, { status: 500 });
    }
    console.log(`[API GET meeting-minutes] fetched ${data?.length ?? 0} records`);
    return NextResponse.json(data as MeetingMinute[]);
  } catch (err) {
    console.error('API GET meeting-minutes unexpected error:', err);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    //console.log('[API POST meeting-minutes] Cookie header:', req.headers.get('cookie'));
    const supabase = createServerClient<Database>(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll().map(c => ({
              name: c.name,
              value: c.value,
              options: {},
            }))
          },
          setAll() {},
        },
      },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    console.log('[API POST meeting-minutes] user:', user, 'userErr:', userErr);
    if (userErr || !user) {
      console.warn('[API POST meeting-minutes] 401 Unauthorized');
      return NextResponse.json({ error: '認証情報が無効です' }, { status: 401 });
    }

    // POSTメソッド内でのZod検証を追加
    const parsed = meetingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'リクエストが不正です', details: parsed.error.errors },
        { status: 400 }
      );
    }
    const body: z.infer<typeof meetingSchema> = parsed.data;

    // 投稿者の facility_id を取得してボディに注入
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', user.id as unknown as string)
      .maybeSingle();

    console.log('[API POST meeting-minutes] profile:', profile, 'profileErr:', profileErr);

    if (profileErr || !profile || !profile.facility_id) {
      return NextResponse.json(
        { error: 'プロファイル取得に失敗しました' },
        { status: 500 },
      );
    }

    // body 内の facility_id が異なっていた場合は上書きする
    const record = {
      ...body,
      facility_id: profile.facility_id,
      recorded_by: user.id,
    };

    const { data, error } = await supabase
      .from('meeting_minutes')
      .insert([record])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: '保存に失敗しました', details: error }, { status: 500 });
    }
    console.log(`[API POST meeting-minutes] inserted id=${data.id}`);
    return NextResponse.json(data as MeetingMinute);
  } catch (err) {
    console.error('API POST meeting-minutes unexpected error:', err);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// src/app/api/meeting-minutes/fix-creators/route.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
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

    // 認証チェック
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // プロファイル取得
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('facility_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'プロファイルが見つかりません' }, { status: 404 });
    }

    // 管理者権限チェック
    if (!['facility_admin', 'superuser'].includes(profile.role || '')) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    console.log('[fix-creators] Starting creator fix for facility:', profile.facility_id);

    // recorded_byがnullの議事録を取得
    const { data: minutesWithoutCreator, error: fetchError } = await supabase
      .from('meeting_minutes')
      .select('id, title, created_at')
      .eq('facility_id', profile.facility_id)
      .is('recorded_by', null);

    if (fetchError) {
      console.error('[fix-creators] Fetch error:', fetchError);
      return NextResponse.json({ error: '議事録の取得に失敗しました' }, { status: 500 });
    }

    console.log('[fix-creators] Found items without creator:', minutesWithoutCreator?.length || 0);

    if (!minutesWithoutCreator || minutesWithoutCreator.length === 0) {
      return NextResponse.json({ 
        message: '更新が必要な議事録はありません',
        updated: 0 
      });
    }

    // 同じ施設の最初のユーザー（通常は作成者）を取得
    const { data: facilityUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id, fullname')
      .eq('facility_id', profile.facility_id)
      .order('created_at', { ascending: true })
      .limit(1);

    if (usersError || !facilityUsers || facilityUsers.length === 0) {
      console.error('[fix-creators] Users fetch error:', usersError);
      return NextResponse.json({ error: '施設ユーザーが見つかりません' }, { status: 500 });
    }

    const defaultUserId = facilityUsers[0].id;
    console.log('[fix-creators] Using default user:', facilityUsers[0].fullname, defaultUserId);

    // recorded_byを更新
    const { data: updateResult, error: updateError } = await supabase
      .from('meeting_minutes')
      .update({ recorded_by: defaultUserId })
      .in('id', minutesWithoutCreator.map(item => item.id))
      .select('id');

    if (updateError) {
      console.error('[fix-creators] Update error:', updateError);
      return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
    }

    console.log('[fix-creators] Updated items:', updateResult?.length || 0);

    return NextResponse.json({ 
      message: `${updateResult?.length || 0}件の議事録の作成者を更新しました`,
      updated: updateResult?.length || 0,
      defaultUser: facilityUsers[0].fullname
    });

  } catch (err) {
    console.error('[fix-creators] Unexpected error:', err);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}
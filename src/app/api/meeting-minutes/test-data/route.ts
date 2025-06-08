// テスト用議事録データを作成するAPI
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

    if (profileErr || !profile || !profile.facility_id) {
      return NextResponse.json({ error: 'プロファイルが見つかりません' }, { status: 404 });
    }

    // 管理者権限チェック
    if (!['facility_admin', 'superuser'].includes(profile.role || '')) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // 会議タイプを取得
    const { data: meetingTypes } = await supabase
      .from('meeting_types')
      .select('id')
      .eq('facility_id', profile.facility_id)
      .limit(1);

    const meetingTypeId = meetingTypes?.[0]?.id || null;

    // テスト議事録を作成
    const testMinutes = [
      {
        title: '仕事の効率化に関する会議',
        meeting_date: new Date().toISOString(),
        content: '本日は仕事の効率化について話し合いました。自己肯定感を高めることで、業務パフォーマンスが向上することが確認されました。具体的には、小さな成功体験を積み重ねることで、モチベーションと生産性が向上します。',
        summary: '仕事の効率化と自己肯定感の関係について議論。小さな成功体験の重要性を確認。',
        keywords: ['仕事', '効率化', '自己肯定感', 'モチベーション'],
        facility_id: profile.facility_id,
        recorded_by: user.id,
        meeting_type_id: meetingTypeId,
        attendees: ['田中', '佐藤', '鈴木'],
        is_transcribed: true,
        processing_status: 'done',
      },
      {
        title: '年齢に応じた健康管理について',
        meeting_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1週間前
        content: '年齢に応じた健康管理の重要性について議論しました。各年齢層に適した運動プログラムと食事管理について検討し、実施計画を策定しました。',
        summary: '年齢別の健康管理プログラムを検討。運動と食事管理の計画を策定。',
        keywords: ['年齢', '健康管理', '運動', '食事'],
        facility_id: profile.facility_id,
        recorded_by: user.id,
        meeting_type_id: meetingTypeId,
        attendees: ['山田', '高橋'],
        is_transcribed: true,
        processing_status: 'done',
      },
    ];

    // データを挿入
    const { data: insertedData, error: insertError } = await supabase
      .from('meeting_minutes')
      .insert(testMinutes)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: '挿入エラー', details: insertError }, { status: 500 });
    }

    return NextResponse.json({ 
      message: `${insertedData?.length || 0}件のテスト議事録を作成しました`,
      created: insertedData
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}
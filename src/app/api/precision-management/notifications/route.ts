// src/app/api/precision-management/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

interface SlackConfig {
  webhook_url: string;
}

/* ============================  GET  ============================== */
/* 未入力の「昨日の記録」を所属施設別に返す */
export async function GET() {
  try {
    const supa = await createServerClient();

    /* 1) 認証 & プロフィール */
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 });

    const { data: profile } = await supa
      .from('profiles')
      .select('facility_id')
      .eq('id', user.id)
      .single();
    const facilityId = profile?.facility_id;
    if (!facilityId)
      return NextResponse.json({ error: '施設が未設定です' }, { status: 400 });

    /* 2) 施設内の部署一覧 */
    const { data: departments, error: deptErr } = await supa
      .from('departments')
      .select('id,name')
      .eq('facility_id', facilityId);
    if (deptErr) throw deptErr;

    /* 3) アクティブ機器を一括取得 */
    const deptIds = departments.map(d => d.id);
    const { data: equipments, error: equipErr } = await supa
      .from('precision_management_equipments')
      .select('department_id,pm_equipment_id,equipment_name')
      .in('department_id', deptIds)
      .eq('is_active', true);
    if (equipErr) throw equipErr;

    /* 4) 昨日の日付 */
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    /* 5) 未入力抽出 */
    const missing: {
      department_id: string;
      department_name: string;
      equipment_id: number;
      equipment_name: string;
    }[] = [];

    for (const dept of departments) {
      const deptEquips = equipments.filter(e => e.department_id === dept.id);
      for (const eq of deptEquips) {
        const { data: recs } = await supa
          .from('precision_management_records')
          .select('record_id')
          .eq('department_id', dept.id)
          .eq('pm_equipment_id', eq.pm_equipment_id as any)
          .eq('implementation_date', yesterday)
          .limit(1);

        if (!recs || recs.length === 0) {
          missing.push({
            department_id: dept.id,
            department_name: dept.name,
            equipment_id: eq.pm_equipment_id,
            equipment_name: eq.equipment_name,
          });
        }
      }
    }

    return NextResponse.json({
      date: yesterday,
      missing_records: missing,
      total_missing: missing.length,
    });
  } catch (e: any) {
    console.error('[notifications][GET] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ============================  POST ============================== */
/* Slack へ通知して notification_logs に記録 */
export async function POST(req: NextRequest) {
  try {
    const { facility_id, notifications, notification_type = 'missing_records' } =
      await req.json();

    if (
      !facility_id ||
      !Array.isArray(notifications) ||
      !notifications.every((n: any) => n?.department_name && n?.equipment_name)
    ) {
      return NextResponse.json(
        { error: 'invalid payload' },
        { status: 400 },
      );
    }

    const supa = await createServerClient();

    /* 認証 */
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 });

    /* Slack 設定取得 */
    const { data: cfg } = await supa
      .from('facility_notifications')
      .select('config')
      .eq('facility_id', facility_id)
      .eq('notification_channel', 'slack')
      .single();
    const webhookUrl = (cfg?.config as Partial<SlackConfig>)?.webhook_url;
    if (!webhookUrl)
      return NextResponse.json(
        { error: 'Slack Webhook 未設定です' },
        { status: 404 },
      );

    /* Slack 投稿 */
    let status: 'sent' | 'failed' = 'sent';
    let error_message: string | null = null;

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:
            `*${notification_type}* (${format(new Date(), 'yyyy-MM-dd')})\n` +
            notifications
              .map((r: any) => `• ${r.department_name} / ${r.equipment_name}`)
              .join('\n'),
        }),
      });
      if (!resp.ok) throw new Error(`Slack API ${resp.statusText}`);
    } catch (err: any) {
      status = 'failed';
      error_message = err.message;
      console.error('[notifications][POST] Slack error:', err);
    }

    /* ログ保存 */
    const { data: log } = await supa
      .from('notification_logs')
      .insert({
        facility_id,
        user_notification_id: null,
        notification_type,
        payload: { notifications },
        status,
        error_message,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return NextResponse.json({
      success: status === 'sent',
      status,
      log_id: log?.id ?? null,
      error: error_message,
    });
  } catch (e: any) {
    console.error('[notifications][POST] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

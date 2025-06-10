// src/app/api/invite/[email]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { createServerClient } from '@/lib/supabaseServer';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/* ----------------------------- 定数 ------------------------------ */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?.`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
const isValidEmail = (e: string) => EMAIL_RE.test(e);

const LIMITS = {
  HOURLY: 10,
  DAILY: 30,
  MONTHLY: 200,
  FACILITY_DAILY: 50,
} as const;

/* ----------------------- レートリミット -------------------------- */
type SB = ReturnType<typeof createServerClient>;

async function checkLimit(
  sb: SB,
  userId: string,
  facilityId: string,
): Promise<{ ok: true } | { ok: false; msg: string }> {
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();

  const [
    { count: hourly },
    { count: daily },
    { count: monthly },
    { count: facilityDaily },
  ] = await Promise.all([
    sb
      .from('user_activity_logs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('action_type', 'user_invitation_sent' as any) // ★ 型を緩める
      .gte('created_at', iso(1 * 60 * 60 * 1000)),
    sb
      .from('user_activity_logs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('action_type', 'user_invitation_sent' as any)
      .gte('created_at', iso(24 * 60 * 60 * 1000)),
    sb
      .from('user_activity_logs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('action_type', 'user_invitation_sent' as any)
      .gte('created_at', iso(30 * 24 * 60 * 60 * 1000)),
    sb
      .from('user_activity_logs')
      .select('id', { count: 'exact' })
      .eq('action_type', 'user_invitation_sent' as any)
      .contains('action_details', { facility_id: facilityId } as any)
      .gte('created_at', iso(24 * 60 * 60 * 1000)),
  ]);

  if ((hourly ?? 0) >= LIMITS.HOURLY)
    return { ok: false, msg: `1時間あたり${LIMITS.HOURLY}件までです。` };
  if ((daily ?? 0) >= LIMITS.DAILY)
    return { ok: false, msg: `1日あたり${LIMITS.DAILY}件までです。` };
  if ((monthly ?? 0) >= LIMITS.MONTHLY)
    return { ok: false, msg: `月間${LIMITS.MONTHLY}件までです。` };
  if ((facilityDaily ?? 0) >= LIMITS.FACILITY_DAILY)
    return {
      ok: false,
      msg: `この施設の1日あたり${LIMITS.FACILITY_DAILY}件までです。`,
    };

  return { ok: true };
}

/* ============================ GET ================================ */
export async function GET(
  req: NextRequest,
  { params }: { params: { email: string } },
) {
  try {
    /* 1) 認証付き SSR クライアント取得 ------------------------------ */
    const sb = await createServerClient();

    // 1) 認証取得
    let admin, authErr;
    try {
      const authRes = await sb.auth.getUser();
      admin = authRes.data.user;
      authErr = authRes.error;
    } catch (e: any) {
      console.error('[invite][auth] getUser error:', { name: e.name, message: e.message });
      return NextResponse.json({ error: 'auth_error', stage: 'auth_get_user' }, { status: 500 });
    }
    if (authErr || !admin) {
      console.error('[invite][auth] unauthorized:', authErr);
      return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 });
    }

    /* 2) メールアドレス検証 ----------------------------------------- */
    const { email: emailParam } = await params;
    const email = decodeURIComponent(emailParam);
    if (!isValidEmail(email)) {
      console.error('[invite][validation] invalid email:', email);
      return NextResponse.json({ error: 'invalid_email', stage: 'validation' }, { status: 400 });
    }

    /* 3) 招待者プロフィール ----------------------------------------- */
    // 3) プロフィール取得
    let profile, profileErr;
    try {
      const res = await sb
        .from('profiles')
        .select('role, facility_id')
        .eq('id', admin.id)
        .single();
      profile = res.data;
      profileErr = res.error;
    } catch (e: any) {
      console.error('[invite][profile] query error:', { name: e.name, message: e.message });
      return NextResponse.json({ error: 'profile_error', stage: 'profile_get' }, { status: 500 });
    }
    if (profileErr || !profile) {
      console.error('[invite][profile] invalid profile error:', profileErr);
      return NextResponse.json({ error: 'profile_error', stage: 'profile_get' }, { status: 500 });
    }

    if (profile.role !== 'superuser' && profile.role !== 'facility_admin')
      return NextResponse.json(
        { error: '招待権限がありません' },
        { status: 403 },
      );

    const facilityId = profile.facility_id!;

    /* 4) レートリミット -------------------------------------------- */
    const limit = await checkLimit(sb, admin.id, facilityId);
    if (!limit.ok) {
      console.error('[invite][rate_limit] exceeded:', limit.msg);
      return NextResponse.json({ error: limit.msg, stage: 'rate_limit' }, { status: 429 });
    }

    const token = `${uuidv4()}-${Date.now()}`;

    /* 4.5) 招待トークンを DB に保存 ------------------------------- */
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7日後
    try {
      await sb
        .from('user_invitations' as any) // table not in generated types
        .insert(
          [
            {
              token,               // DB には 'token' 列が存在
              email,
              facility_id: facilityId,
              invited_by: admin.id,
              expires_at: expiresAt,
              created_at: new Date().toISOString(),
            },
          ] as any,
        );
    } catch (e: any) {
      console.error('[invite][db] token insert error:', { name: e.name, message: e.message });
      return NextResponse.json(
        { error: 'invitation_save_error', stage: 'db_save', detail: e.message },
        { status: 500 },
      );
    }

    /* 6) Service-Role クライアント ---------------------------------- */
    const adminClient = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
    );

    /* 7) 招待メール送信 -------------------------------------------- */
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL!}/register?token=${token}`;

    // 7) 招待メール発行
    try {
      const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { facility_id: facilityId },
      });
      if (inviteErr) {
        console.error('[invite][invite] inviteUser error:', inviteErr);
        return NextResponse.json({ error: inviteErr.message, stage: 'invite' }, { status: 500 });
      }
    } catch (e: any) {
      console.error('[invite][invite] exception:', { name: e.name, message: e.message });
      return NextResponse.json({ error: 'invite_error', stage: 'invite' }, { status: 500 });
    }

    /* 8) アクティビティログ ---------------------------------------- */
    // 8) アクティビティログ
    try {
      await sb.from('user_activity_logs').insert([
        {
          user_id: admin.id,
          performed_by: admin.id,
          action_type: 'user_invitation_sent',
          action_details: {
            invited_email: email,
            facility_id: facilityId,
            token,
            expires_at: expiresAt,
          },
        },
      ]);
    } catch (e: any) {
      console.error('[invite][log] insert error:', { name: e.name, message: e.message });
      // ログ失敗でも成功レスポンスを返す
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[invite][unexpected] error:', { name: err.name, message: err.message });
    return NextResponse.json(
      { error: 'internal_error', stage: 'unexpected', detail: err.message },
      { status: 500 },
    );
  }
}

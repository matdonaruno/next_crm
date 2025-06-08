// src/app/api/invitations/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { createServerClient } from '@/lib/supabase/server';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/* ----------------------------- GET ------------------------------ */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return json({ error: '招待トークンが必要です' }, 400);

  const supabase = await createServerClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('user_invitations')
    .select(`
      id, email, role, facility_id, department_id,
      expires_at, facilities(name), departments(name)
    `)
    .eq('invitation_token', token)
    .eq('is_used', false)
    .gt('expires_at', now)
    .single();

  if (error || !data) {
    return json({ error: '無効、または期限切れの招待トークンです' }, 400);
  }

  return json({
    valid: true,
    invitation: {
      id: data.id,
      email: data.email,
      role: data.role,
      facilityId: data.facility_id,
      departmentId: data.department_id,
      facilityName: data.facilities?.name ?? '',
      departmentName: data.departments?.name ?? '',
      expiresAt: data.expires_at,
    },
  });
}

/* ----------------------------- POST ----------------------------- */
export async function POST(req: NextRequest) {
  const { token, password, fullName, policyAgreed } = (await req.json()) as {
    token?: string;
    password?: string;
    fullName?: string;
    policyAgreed?: boolean;
  };
  if (!token || !password) {
    return json({ error: 'token と password は必須です' }, 400);
  }

  const supabase = await createServerClient();
  const now = new Date().toISOString();

  /* 1) 招待レコード */
  const { data: invite, error: invErr } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('invitation_token', token)
    .eq('is_used', false)
    .gt('expires_at', now)
    .single();

  if (invErr || !invite) {
    return json({ error: '無効、または期限切れの招待トークンです' }, 400);
  }

  /* 2) service_role クライアント */
  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  /* 3) 同施設+同メールの既存ユーザー */
  const { data: existing } = await admin
    .from('profiles')
    .select('id, fullname')
    .eq('facility_id', invite.facility_id)
    .eq('email', invite.email)
    .maybeSingle();

  const isExisting = !!existing;
  let userId: string;

  if (isExisting && existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password });
    await admin.from('profiles').upsert({
      id: userId,
      fullname: fullName ?? existing.fullname,
      email: invite.email,
      facility_id: invite.facility_id,
      department_id: invite.department_id,
      role: invite.role,
      is_active: true,
    });
  } else {
    const { data: signUp, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName ?? invite.email.split('@')[0],
        role: invite.role,
        facility_id: invite.facility_id,
        department_id: invite.department_id,
      },
    });
    if (error || !signUp?.user)
      return json({ error: error?.message ?? 'ユーザー作成エラー' }, 500);

    userId = signUp.user.id;
    await admin.from('profiles').insert({
      id: userId,
      fullname: fullName ?? signUp.user.user_metadata.full_name,
      email: invite.email,
      facility_id: invite.facility_id,
      department_id: invite.department_id,
      role: invite.role,
      is_active: true,
    });
  }

  /* 同意記録 (任意失敗) */
  if (policyAgreed) {
    try {
      await admin
        .from('user_policy_consents' as any) // table is not in generated types
        .insert(
          [
            {
              user_id: userId,
              policy_type: 'tos_privacy',
              created_at: now,
            },
          ] as any,
        );
    } catch (e: any) {
      console.error('[verify][policy] consent insert error:', { name: e.name, message: e.message });
      // 同意保存の失敗は致命的ではないため続行
    }
  }

  /* 4) 招待レコード更新 & ログ */
  await admin.from('user_invitations')
    .update({ is_used: true, used_at: now })
    .eq('id', invite.id);

  await admin.from('user_activity_logs').insert({
    user_id: userId,
    action_type: 'user_registration_completed',
    action_details: {
      invitation_id: invite.id,
      email: invite.email,
      role: invite.role,
      is_existing_user: isExisting,
    },
    performed_by: userId,
  });

  return json(
    { success: true, isExistingUser: isExisting, message: '登録完了。ログインしてください。' },
    201,
  );
}

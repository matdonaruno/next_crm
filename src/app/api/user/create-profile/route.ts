// src/app/api/user/create-profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

type ProfileResp = Database['public']['Tables']['profiles']['Row'];

/** POST /api/user/create-profile
 *  body: { id:string; fullname?:string; email?:string; facility_id?:string|null;
 *          role?: 'regular_user' | 'facility_admin' | … ; is_active?:boolean }
 */
export async function POST(req: NextRequest) {
  try {
    /* 1) Supabase (SSR) ＆ ログイン確認 ─────────────────── */
    const supabase = await createServerClient();
    let user, authErr;
    try {
      const authRes = await supabase.auth.getUser();
      user = authRes.data.user;
      authErr = authRes.error;
    } catch (e: any) {
      console.error('[create-profile] auth_get_user error:', { name: e.name, message: e.message, stack: e.stack });
      return NextResponse.json({ error: 'auth_error', stage: 'auth_get_user' }, { status: 500 });
    }
    if (authErr || !user) {
      console.error('[create-profile] unauthorized:', authErr);
      return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 });
    }

    /* 2) body パース & バリデート ─────────────────────── */
    type Body = {
      id: string;
      fullname?: string | null;
      email?: string;
      facility_id?: string | null;
      role?: Database['public']['Enums']['user_role'];
      is_active?: boolean;
    };
    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch (e) {
      console.error('[create-profile] json_parse error:', e);
      return NextResponse.json({ error: 'invalid_json', stage: 'validation' }, { status: 400 });
    }
    if (typeof bodyRaw !== 'object' || bodyRaw === null) {
      return NextResponse.json({ error: 'invalid_json', stage: 'validation' }, { status: 400 });
    }
    const body = bodyRaw as Body;

    // Basic field validation
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id_required', stage: 'validation' }, { status: 400 });
    }
    if (body.id !== user.id) {
      return NextResponse.json({ error: 'forbidden', stage: 'validation' }, { status: 403 });
    }

    /* 3) データ整形 (Insert 型に合わせる) ───────────────── */
    const profileInsert: Database['public']['Tables']['profiles']['Insert'] = {
      id: body.id,
      fullname: body.fullname ?? null,
      email: body.email ?? user.email!,
      facility_id: body.facility_id ?? null,
      role: body.role ?? 'regular_user',
      is_active: body.is_active ?? true,
    };

    /* 4) 既存レコード確認 ───────────────────────────── */
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', body.id)
      .maybeSingle();

    if (existing) {
      /* ---------- UPDATE ---------- */
      const updatePayload: Database['public']['Tables']['profiles']['Update'] = {
        fullname: profileInsert.fullname,
        email: profileInsert.email,
        facility_id: profileInsert.facility_id,
        role: profileInsert.role,
        is_active: profileInsert.is_active,
      };

      const { data, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', body.id)
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json<ProfileResp>(data);
    }

    /* ---------- INSERT ---------- */
    const { data, error } = await supabase
      .from('profiles')
      .insert(profileInsert)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json<ProfileResp>(data, { status: 201 });
  } catch (e: any) {
    console.error('[create-profile] unexpected error:', { name: e.name, message: e.message, stack: e.stack });
    return NextResponse.json(
      { error: 'internal_error', stage: 'unexpected', message: e.message },
      { status: 500 },
    );
  }
}

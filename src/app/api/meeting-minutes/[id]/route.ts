import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';


export const dynamic = 'force-dynamic';

/**
 * GET /api/meeting-minutes/[id]
 * 1. 認証 → facility_id を取得
 * 2. facility が一致する議事録を 1 件取得して返却
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = await params;
  const supabase = await createClient();

  /* -------- 1) 認証 -------- */
  let user, authErr;
  try {
    const authRes = await supabase.auth.getUser();
    user = authRes.data.user;
    authErr = authRes.error;
  } catch (e) {
    console.error('[minutes/get] auth_get_user:', e);
    return NextResponse.json(
      { error: 'auth_error', stage: 'auth_get_user' },
      { status: 500 },
    );
  }
  if (authErr || !user) {
    return NextResponse.json(
      { error: 'unauthorized', stage: 'auth' },
      { status: 401 },
    );
  }

  /* -------- 2) プロファイル取得 & facility_id -------- */
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('facility_id, role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile?.facility_id) {
    console.error('[minutes/get] profile_error:', profileErr);
    return NextResponse.json(
      { error: 'profile_error', stage: 'profile' },
      { status: 403 },
    );
  }

  /* -------- 3) 議事録取得（facility 所有チェック込み） -------- */
  const { data: minute, error: getErr } = await supabase
    .from('meeting_minutes')
    .select(
      `
        *,
        profiles!meeting_minutes_recorded_by_fkey ( fullname ),
        meeting_types ( name )
      `,
    )
    .eq('id', id)
    .eq('facility_id', profile.facility_id)
    .single();

  if (getErr) {
    console.error('[minutes/get] get_error:', getErr);
    return NextResponse.json(
      { error: 'not_found', stage: 'get' },
      { status: 404 },
    );
  }

  // レスポンスに権限情報を追加
  return NextResponse.json({
    ...minute,
    canDelete: profile.role !== 'user', // 一般ユーザー以外は削除可能
  }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = await params;
  const supabase = await createClient();

  /* -------- 1) 認証 -------- */
  let user, authErr;
  try {
    const authRes = await supabase.auth.getUser();
    user = authRes.data.user;
    authErr = authRes.error;
  } catch (e) {
    console.error('[minutes/delete] auth_get_user:', e);
    return NextResponse.json({ error: 'auth_error', stage: 'auth_get_user' }, { status: 500 });
  }
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 });
  }

  /* -------- 2) プロファイル取得 & facility_id & 権限チェック -------- */
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('facility_id, role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile?.facility_id) {
    console.error('[minutes/delete] profile_error:', profileErr);
    return NextResponse.json({ error: 'profile_error', stage: 'profile' }, { status: 403 });
  }

  // 権限チェック：一般ユーザー以外のみ削除可能
  if (profile.role === 'user') {
    return NextResponse.json({ error: 'insufficient_permissions', message: '削除権限がありません' }, { status: 403 });
  }

  /* -------- 3) 議事録データ取得（音声ファイル削除のため） -------- */
  const { data: minuteToDelete, error: getErr } = await supabase
    .from('meeting_minutes')
    .select('audio_file_path')
    .eq('id', id)
    .eq('facility_id', profile.facility_id)
    .single();

  if (getErr) {
    console.error('[minutes/delete] get_error:', getErr);
    return NextResponse.json({ error: 'not_found', stage: 'get' }, { status: 404 });
  }

  /* -------- 4) 音声ファイル削除 -------- */
  if (minuteToDelete.audio_file_path) {
    try {
      const { error: storageErr } = await supabase.storage
        .from('minutesaudio')
        .remove([minuteToDelete.audio_file_path]);
      
      if (storageErr) {
        console.warn('[minutes/delete] 音声ファイル削除エラー:', storageErr);
        // 音声ファイル削除エラーでも処理続行
      } else {
        console.log('[minutes/delete] 音声ファイル削除完了:', minuteToDelete.audio_file_path);
      }
    } catch (e) {
      console.warn('[minutes/delete] 音声ファイル削除例外:', e);
    }
  }

  /* -------- 5) 議事録削除 -------- */
  const { data: deleted, error: delErr } = await supabase
    .from('meeting_minutes')
    .delete()
    .eq('id', id)
    .eq('facility_id', profile.facility_id)
    .select(); // 返却データで削除有無を確認

  if (delErr) {
    console.error('[minutes/delete] delete_error:', delErr);
    return NextResponse.json({ error: 'delete_error', stage: 'delete' }, { status: 500 });
  }

  if (!deleted || deleted.length === 0) {
    // 他施設 or 存在しない
    return NextResponse.json({ error: 'not_found_or_forbidden', stage: 'delete' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  console.log('[PATCH] === 議事録更新API開始 ===', { 
    url: req.url,
    method: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    params 
  });
  const { id } = await params;
  console.log('[PATCH] 議事録ID:', id);
  const supabase = await createClient();

  /* -------- 1) 認証 -------- */
  let user, authErr;
  try {
    const authRes = await supabase.auth.getUser();
    user = authRes.data.user;
    authErr = authRes.error;
  } catch (e) {
    console.error('[minutes/patch] auth_get_user:', e);
    return NextResponse.json({ error: 'auth_error', stage: 'auth_get_user' }, { status: 500 });
  }
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 });
  }

  /* -------- 2) プロファイル取得 & facility_id -------- */
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('facility_id, role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile?.facility_id) {
    console.error('[minutes/patch] profile_error:', profileErr);
    return NextResponse.json({ error: 'profile_error', stage: 'profile' }, { status: 403 });
  }

  /* -------- 3) 現在の議事録データ取得（権限確認のため） -------- */
  const { data: currentMinute, error: getErr } = await supabase
    .from('meeting_minutes')
    .select('recorded_by, is_confirmed')
    .eq('id', id)
    .eq('facility_id', profile.facility_id)
    .single();

  if (getErr) {
    console.error('[minutes/patch] get_error:', getErr);
    return NextResponse.json({ error: 'not_found', stage: 'get' }, { status: 404 });
  }

  // 権限チェック：作成者または管理者のみ編集可能
  const canEdit = currentMinute.recorded_by === user.id || profile.role !== 'user';
  if (!canEdit) {
    return NextResponse.json({ 
      error: 'insufficient_permissions', 
      message: '編集権限がありません' 
    }, { status: 403 });
  }

  // 確定済みの議事録は編集不可
  if (currentMinute.is_confirmed) {
    return NextResponse.json({ 
      error: 'already_confirmed', 
      message: '確定済みの議事録は編集できません' 
    }, { status: 400 });
  }

  /* -------- 4) リクエストボディ取得 -------- */
  let updateData;
  try {
    updateData = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  /* -------- 5) 更新実行 -------- */
  const { data: updated, error: updateErr } = await supabase
    .from('meeting_minutes')
    .update(updateData)
    .eq('id', id)
    .eq('facility_id', profile.facility_id)
    .select()
    .single();

  if (updateErr) {
    console.error('[minutes/patch] update_error:', updateErr);
    return NextResponse.json({ error: 'update_error', details: updateErr }, { status: 500 });
  }

  return NextResponse.json(updated);
}

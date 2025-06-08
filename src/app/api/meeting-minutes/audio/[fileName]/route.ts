import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server'
import { getStoragePath } from '@/utils/audio'

// 動的実行フラグを追加（Cookieを毎回読み込むため）
export const dynamic = 'force-dynamic'

/**
 * 動画・音声などバイナリはファイルそのものを proxy するより
 * 署名付き URL に 302 で飛ばす方が効率的 (CDN キャッシュ可)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { fileName: string } },
) {
  const { fileName } = await params;
  // 正しいSupabaseクライアントを使用
  const supabase = await createClient()

  /** 認証 */
  let user, authErr
  try {
    const authRes = await supabase.auth.getUser()
    user = authRes.data.user
    authErr = authRes.error
  } catch (e) {
    console.error('[audio] auth getUser error:', e)
    return NextResponse.json({ error: 'auth_error', stage: 'auth_get_user' }, { status: 500 })
  }
  if (authErr || !user) {
    console.error('[audio] unauthorized:', authErr)
    return NextResponse.json({ error: 'unauthorized', stage: 'auth' }, { status: 401 })
  }

  /** 施設 ID 取得 (profiles テーブル想定) */
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('facility_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.facility_id) {
    console.error('[audio] profile error:', profileError)
    return NextResponse.json({ error: 'profile_error', stage: 'profile' }, { status: 403 })
  }

  /** ファイルパスを処理 */
  const raw = decodeURIComponent(fileName)
  
  // ユーティリティ関数を使用してパスを生成
  const filePath = getStoragePath(raw, profile.facility_id)

  // 施設IDの一致を確認（セキュリティ対策）
  if (filePath.startsWith('meeting_recordings/') && 
      !filePath.startsWith(`meeting_recordings/${profile.facility_id}/`)) {
    console.error('施設IDが一致しません:', { 
      requested: filePath, 
      userFacilityId: profile.facility_id 
    });
    return NextResponse.json({ error: 'access_denied', stage: 'path_check' }, { status: 403 });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('オーディオファイルパス:', { raw, filePath });
  }

  /** 署名付き URL 発行 (10分間 - 長い音声ファイルにも対応) */
  const expiresIn = 10 * 60; // 10分間（秒単位）
  const { data, error } = await supabase.storage
    .from('minutesaudio')
    .createSignedUrl(filePath, expiresIn)

  if (error || !data?.signedUrl) {
    console.error('SignedURL error:', error, filePath)
    return NextResponse.json({ error: 'signed_url_error', stage: 'signed_url' }, { status: 404 })
  }

  /** 302 Redirect */
  return NextResponse.redirect(data.signedUrl, 302)
}

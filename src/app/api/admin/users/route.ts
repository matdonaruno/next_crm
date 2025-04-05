import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerClient } from '@/utils/supabase/server'; // サーバーサイドの認証チェック用

export async function GET(request: NextRequest) {
  console.log('[API /api/admin/users] GETリクエスト受信');
  try {
    // --- 1. 認証と権限チェック ---
    console.log('[API /api/admin/users] 認証と権限チェック開始');
    const cookieStore = cookies();
    const supabaseAuth = createServerClient(cookieStore);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError) {
      console.error('[API /api/admin/users] 認証エラー:', authError);
      return NextResponse.json({ error: '認証エラー', details: authError.message }, { status: 500 });
    }
    if (!user) {
      console.warn('[API /api/admin/users] ユーザー未認証');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAuth
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[API /api/admin/users] プロファイル取得エラー:', profileError);
      return NextResponse.json({ error: 'プロファイル取得エラー', details: profileError.message }, { status: 500 });
    }
    if (!profile || (profile.role !== 'superuser' && profile.role !== 'facility_admin')) {
      console.warn('[API /api/admin/users] 権限不足:', { userId: user.id, role: profile?.role });
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }
    console.log('[API /api/admin/users] 権限チェックOK:', { userId: user.id, role: profile.role });

    // --- 2. 環境変数とサービスロールクライアント初期化 ---
    console.log('[API /api/admin/users] 環境変数チェックとクライアント初期化開始');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[API /api/admin/users] 環境変数が設定されていません。NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が必要です。');
      return NextResponse.json({ error: 'サーバー設定エラー (環境変数)' }, { status: 500 });
    }
    console.log('[API /api/admin/users] 環境変数OK (URLとキーの存在確認のみ)');

    // ★★★ デバッグログ追加: serviceRoleKey の値を確認 ★★★
    console.log('[API /api/admin/users] サービスロールキーの値 (最初の数文字):', typeof serviceRoleKey === 'string' ? serviceRoleKey.substring(0, 5) + '...' : 'キーが取得できません (' + typeof serviceRoleKey + ')');

    if (typeof serviceRoleKey !== 'string' || serviceRoleKey.length < 10) { // 簡単なバリデーション
      console.error('[API /api/admin/users] サービスロールキーが不正または短すぎます。');
      return NextResponse.json({ error: 'サーバー設定エラー (サービスキー不正)' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    console.log('[API /api/admin/users] サービスロールクライアント初期化完了');

    // --- 3. ユーザーリスト取得 ---
    console.log('[API /api/admin/users] Supabase Admin API (listUsers) 呼び出し開始');
    const { data, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers();

    if (listUsersError) {
      console.error('[API /api/admin/users] Supabase Admin API エラー (listUsers):', listUsersError);
      // エラーオブジェクト全体を返すように試みる
      return NextResponse.json(
        { 
          error: 'ユーザーリストの取得に失敗しました (Supabase API エラー)',
          details: listUsersError // エラーオブジェクト全体
        },
        { status: 500 }
      );
    }
    console.log(`[API /api/admin/users] Supabase Admin API (listUsers) 成功: ${data.users.length} 件取得`);

    // --- 4. データ整形と応答 ---
    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || '-', 
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      // role, is_active, facility は別途 profiles から取得する必要あり
    }));

    // 現状では profiles の情報は含めずに返す
    return NextResponse.json(users);

  } catch (error: any) {
    // 予期せぬエラーをキャッチ
    console.error('[API /api/admin/users] 予期せぬエラー:', error);
    return NextResponse.json(
      { error: 'サーバー内部エラーが発生しました', details: error.message, stack: error.stack },
      { status: 500 }
    );
  }
} 
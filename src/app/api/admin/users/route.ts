import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerClient } from '@/utils/supabase/server'; // サーバーサイドの認証チェック用

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(cookieStore);

  // 認証と権限チェック (管理者かどうか)
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'superuser' && profile.role !== 'facility_admin')) {
    return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
  }

  // サービスロールキーを使用してSupabaseクライアントを初期化
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 全ユーザーリストを取得 (ページネーションを考慮する場合は引数を追加)
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error('Supabase Admin API エラー (listUsers):', error);
      throw error;
    }

    // 必要な情報を抽出して整形
    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || '-', // user_metadataから名前を取得
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      // 他に必要な情報があれば追加 (roleはprofilesから別途取得が必要になる)
    }));

    // ★注意: この方法ではprofilesテーブルのroleやis_active, facility情報は取得できません。
    // 必要であれば、ここでprofilesテーブルも取得してマージする必要があります。
    // 簡単化のため、一旦認証情報のみを返します。

    return NextResponse.json(users);

  } catch (error: any) {
    console.error('ユーザーリスト取得APIエラー:', error);
    return NextResponse.json(
      { error: 'ユーザーリストの取得に失敗しました', details: error.message },
      { status: 500 }
    );
  }
} 
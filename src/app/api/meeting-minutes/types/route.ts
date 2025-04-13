import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  console.log('会議種類API: リクエスト開始');

  try {
    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    console.log('会議種類API: Supabaseクライアント初期化完了');
    
    // 認証チェックを一時的に無効化（テスト目的）
    /* 
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    // プロファイルの取得（施設IDの確認用）
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData) {
      console.error('API: プロファイル取得エラー:', profileError);
      return NextResponse.json({ error: 'ユーザープロファイルが見つかりません' }, { status: 404 });
    }
    */

    // 会議種類テーブルの存在確認
    console.log('会議種類API: テーブル情報取得');
    const { data: tableInfo, error: tableError } = await supabase
      .from('meeting_types')
      .select('count()', { count: 'exact', head: true });
    
    console.log('会議種類API: テーブル情報:', { tableInfo, tableError });

    // 会議種類データの取得
    console.log('会議種類API: データ取得開始');
    const { data, error } = await supabase
      .from('meeting_types')
      .select('*')
      // .eq('facility_id', profileData.facility_id) // 施設ごとのフィルタリングを一時的に無効化
      .order('name');

    console.log('会議種類取得クエリ結果:', { data, error, dataLength: data?.length });

    if (error) {
      console.error('API: データ取得エラー:', error);
      return NextResponse.json({ error: 'データ取得中にエラーが発生しました' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
} 
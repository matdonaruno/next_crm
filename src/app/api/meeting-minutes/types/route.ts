// src/app/api/meeting-minutes/types/route.ts
import { createServerClient } from '@/lib/supabaseServer';
import type { Database } from '@/types/supabase';
import { NextRequest, NextResponse } from 'next/server';

// 動的実行フラグを追加（Cookieを毎回読み込むため）
export const dynamic = 'force-dynamic';

// Use the generated Supabase Row type for meeting_types
type MeetingType = Database['public']['Tables']['meeting_types']['Row'];

export async function GET(req: NextRequest) {
  console.log('会議種類API: リクエスト開始');

  try {
    // Supabaseクライアントの初期化
    const supabase = await createServerClient();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('会議種類API: Supabaseクライアント初期化完了');
    }
    
    // 認証チェックを一時的に無効化（テスト目的）
    /* 
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 認証情報の確認
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('API: セッション取得エラー:', userError);
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
    if (process.env.NODE_ENV === 'development') {
      console.log('会議種類API: テーブル情報取得');
    }
    const { data: tableInfo, error: tableError } = await supabase
      .from('meeting_types')
      .select('count()', { count: 'exact', head: true });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('会議種類API: テーブル情報:', { tableInfo, tableError });
    }

    // 会議種類データの取得
    if (process.env.NODE_ENV === 'development') {
      console.log('会議種類API: データ取得開始');
    }
    const { data, error } = await supabase
      .from('meeting_types')
      .select('*')
      // .eq('facility_id', profileData.facility_id) // 施設ごとのフィルタリングを一時的に無効化
      .order('name');

    if (process.env.NODE_ENV === 'development') {
      console.log('会議種類取得クエリ結果:', { data, error, dataLength: data?.length });
    }

    if (error) {
      console.error('API: データ取得エラー:', error);
      return NextResponse.json({ error: 'データ取得中にエラーが発生しました' }, { status: 500 });
    }

    console.log(`[API GET meeting-types] fetched ${data?.length ?? 0} records`);
    return NextResponse.json<MeetingType[]>(data, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}
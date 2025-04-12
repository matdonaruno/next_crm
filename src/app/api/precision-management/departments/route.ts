import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    console.log('API: departments - リクエスト開始');
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    console.log('API: Supabaseクライアント作成完了');

    // まず利用可能なテーブルを確認
    try {
      const { data: tableList, error: tableListError } = await (await supabase.rpc('get_tables'));

      if (tableListError) {
        console.log('API: テーブル一覧取得エラー:', tableListError);
      } else {
        console.log('API: 利用可能なテーブル:', tableList);
      }
    } catch (e) {
      console.log('API: テーブル一覧取得プロシージャが利用できない可能性があります');
    }

    // departments テーブルからデータを取得
    console.log('API: departmentsテーブルからデータ取得開始');
    
    // テーブルの構造を確認するために1行だけ取得してみる
    try {
      const { data: sampleData, error: sampleError } = await (await supabase.from('departments')).select('*').limit(1);

      if (sampleError) {
        console.error('API: departments テーブル構造確認エラー:', sampleError);
      } else {
        console.log('API: departments テーブル構造:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      }
    } catch (e) {
      console.error('API: departments テーブル構造確認中の予期せぬエラー:', e);
    }

    // 実際のデータ取得
    const { data, error } = await (await supabase.from('departments'))
      .select('id, name')  // department_nameのエイリアスはなしで、直接存在するカラム名を指定
      .order('name', { ascending: true });

    if (error) {
      console.error('API: Supabase error:', error);
      return NextResponse.json({ 
        error: 'Supabaseエラー: ' + error.message,
        code: error.code,
        details: error.details
      }, { status: 500 });
    }

    console.log('API: データ取得完了', data?.length || 0, '件');

    if (!data || !Array.isArray(data)) {
      console.error('API: Invalid data format:', data);
      return NextResponse.json({ 
        error: 'データ形式エラー',
        data_received: data
      }, { status: 500 });
    }

    console.log('API: 正常にレスポンス返却');
    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期せぬエラー:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
} 
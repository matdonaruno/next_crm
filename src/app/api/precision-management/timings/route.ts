import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    console.log('API: timings - リクエスト開始');
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    console.log('API: Supabaseクライアント作成完了');

    // テーブル構造を確認
    try {
      const { data: sampleData, error: sampleError } = await supabase
        .from('implementation_timings')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error('API: implementation_timings テーブル構造確認エラー:', sampleError);
      } else {
        console.log('API: implementation_timings テーブル構造:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      }
    } catch (e) {
      console.error('API: テーブル構造確認中の予期せぬエラー:', e);
    }

    const { data, error } = await supabase
      .from('implementation_timings')
      .select('timing_id, timing_name')
      .order('timing_name', { ascending: true });

    if (error) {
      console.error('API: タイミングデータ取得エラー:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: タイミングデータ取得完了', data?.length || 0, '件');
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('API: 予期せぬエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);

    const { data, error } = await supabase.from('implementation_timings')
      .insert({
        timing_name: body.timing_name
      })
      .select();

    if (error) {
      console.error('API: タイミング追加エラー:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: タイミング追加完了', data?.length || 0, '件');
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('API: 予期せぬエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラーが発生しました' }, 
      { status: 500 }
    );
  }
} 
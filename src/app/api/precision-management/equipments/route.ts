import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const departmentId = searchParams.get('department_id');
    
    console.log(`API: equipments - リクエスト開始, department_id=${departmentId}`);

    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    console.log('API: Supabaseクライアント作成完了');

    // テーブル構造を確認
    try {
      const { data: sampleData, error: sampleError } = await supabase
        .from('precision_management_equipments')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error('API: precision_management_equipments テーブル構造確認エラー:', sampleError);
      } else {
        console.log('API: precision_management_equipments テーブル構造:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      }
    } catch (e) {
      console.error('API: テーブル構造確認中の予期せぬエラー:', e);
    }

    // クエリを構築
    let query = supabase.from('precision_management_equipments').select('*');
    
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }
    
    // アクティブな機器のみを返す
    query = query.eq('is_active', true);
    
    // 名前でソート
    query = query.order('equipment_name', { ascending: true });
    
    const { data, error } = await query;

    if (error) {
      console.error('API: 機器データ取得エラー:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: 機器データ取得完了', data?.length || 0, '件');
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

    const { data, error } = await (await supabase.from('precision_management_equipments'))
      .insert({
        equipment_name: body.equipment_name,
        department_id: body.department_id,
        model_number: body.model_number,
        serial_number: body.serial_number,
        installation_date: body.installation_date,
        maintenance_interval: body.maintenance_interval,
        is_active: body.is_active ?? true
      })
      .select();

    if (error) {
      console.error('API: 機器登録エラー:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: 機器登録完了', data?.length || 0, '件');
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('API: 予期せぬエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラーが発生しました' }, 
      { status: 500 }
    );
  }
} 
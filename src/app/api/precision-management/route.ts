import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { PrecisionManagementRecord, PrecisionManagementRecordWithDetails } from '@/types/precision-management';

export async function GET(request: NextRequest) {
  try {
    console.log('API: precision_management - リクエスト開始');
    const searchParams = request.nextUrl.searchParams;
    const departmentId = searchParams.get('department_id');
    const equipmentId = searchParams.get('equipment_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    console.log(`API: パラメータ - department_id=${departmentId}, start_date=${startDate}, end_date=${endDate}`);

    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    console.log('API: Supabaseクライアント作成完了');

    // テーブル構造を確認
    try {
      const { data: sampleData, error: sampleError } = await supabase
        .from('precision_management_records')
        .select('*')
        .limit(1);

      if (sampleError) {
        console.error('API: precision_management_records テーブル構造確認エラー:', sampleError);
      } else {
        console.log('API: precision_management_records テーブル構造:', sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : []);
      }
    } catch (e) {
      console.error('API: テーブル構造確認中の予期せぬエラー:', e);
    }

    // まず基本クエリを作成（結合なし）
    let query = supabase
      .from('precision_management_records')
      .select('*')
      .order('implementation_date', { ascending: false });

    // 検索条件の適用
    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (equipmentId) {
      query = query.eq('pm_equipment_id', equipmentId);
    }

    if (startDate) {
      query = query.gte('implementation_date', startDate);
    }

    if (endDate) {
      query = query.lte('implementation_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('API: 記録データ取得エラー:', error);
      return NextResponse.json({ 
        error: error.message,
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: 基本記録データ取得完了', data?.length || 0, '件');

    // 空の配列の場合はそのまま返す
    if (!data || data.length === 0) {
      return NextResponse.json([]);
    }

    // 関連データを取得（部署情報）
    const departmentIds = [...new Set(data.map(record => record.department_id))];
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .in('id', departmentIds);
    
    if (deptError) {
      console.error('API: 部署データ取得エラー:', deptError);
    }
    
    // 関連データを取得（機器情報）
    const equipmentIds = [...new Set(data.map(record => record.pm_equipment_id))];
    const { data: equipments, error: equipError } = await supabase
      .from('precision_management_equipments')
      .select('pm_equipment_id, equipment_name')
      .in('pm_equipment_id', equipmentIds);
    
    if (equipError) {
      console.error('API: 機器データ取得エラー:', equipError);
    }

    // 関連データを取得（実施タイミング情報）
    const timingIds = [...new Set(data.map(record => record.timing_id))];
    const { data: timings, error: timingError } = await supabase
      .from('implementation_timings')
      .select('timing_id, timing_name')
      .in('timing_id', timingIds);
    
    if (timingError) {
      console.error('API: タイミングデータ取得エラー:', timingError);
    }

    // 部署、機器、タイミングの情報をマップに変換して検索しやすくする
    const departmentMap: Record<string, string> = {};
    (departments || []).forEach(dept => {
      departmentMap[dept.id] = dept.name;
    });
    
    const equipmentMap: Record<number, string> = {};
    (equipments || []).forEach(equip => {
      equipmentMap[equip.pm_equipment_id] = equip.equipment_name;
    });
    
    const timingMap: Record<number, string> = {};
    (timings || []).forEach(timing => {
      timingMap[timing.timing_id] = timing.timing_name;
    });

    // レスポンス形式の整形（マップを使って関連データを取得）
    const formattedData = data.map((record) => ({
      record_id: record.record_id,
      department_id: record.department_id,
      pm_equipment_id: record.pm_equipment_id,
      implementation_date: record.implementation_date,
      implementation_time: record.implementation_time || '00:00',
      implementer: record.implementer,
      timing_id: record.timing_id,
      implementation_count: record.implementation_count,
      error_count: record.error_count,
      shift_trend: record.shift_trend,
      remarks: record.remarks,
      created_at: record.created_at,
      updated_at: record.updated_at,
      department_name: departmentMap[record.department_id] || '不明な部署',
      equipment_name: equipmentMap[record.pm_equipment_id] || '不明な機器',
      timing_name: timingMap[record.timing_id] || '不明なタイミング'
    })) as PrecisionManagementRecordWithDetails[];

    console.log('API: フォーマット済みデータの件数:', formattedData.length);
    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('API: 予期せぬエラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '不明なエラーが発生しました' }, 
      { status: 500 }
    );
  }
}

// 時間を15分単位に丸める関数
const roundTimeToNearest15Minutes = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const roundedMinutes = Math.round(minutes / 15) * 15;
  
  // 分が60になった場合は時間を1つ進める
  const adjustedHours = roundedMinutes === 60 ? hours + 1 : hours;
  const adjustedMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
  
  return `${String(adjustedHours).padStart(2, '0')}:${String(adjustedMinutes).padStart(2, '0')}`;
};

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // ユーザー認証情報の取得
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    console.log('API: POST リクエスト処理 - 認証済みユーザー:', session.user.email);
    
    const body = await request.json();
    const timeToUse = body.implementation_time || body.implementation_date.split('T')[1]?.substring(0, 5) || '00:00';
    // 時間を15分単位に丸める
    const roundedTime = roundTimeToNearest15Minutes(timeToUse);

    const newRecord: Omit<PrecisionManagementRecord, 'record_id' | 'created_at' | 'updated_at'> = {
      department_id: body.department_id,
      pm_equipment_id: body.pm_equipment_id,
      implementation_date: body.implementation_date.split('T')[0], // 日付部分のみ抽出
      implementation_time: roundedTime, // 丸めた時間を使用
      implementer: body.implementer,
      timing_id: body.timing_id,
      implementation_count: body.implementation_count,
      error_count: body.error_count,
      shift_trend: body.shift_trend,
      remarks: body.remarks
    };

    // 実装時間をログに記録して確認
    console.log('API: 受け取った日付:', body.implementation_date);
    console.log('API: 保存する日付:', newRecord.implementation_date);
    console.log('API: 保存する時間:', newRecord.implementation_time);

    // バリデーション
    if (!newRecord.department_id || !newRecord.pm_equipment_id || !newRecord.implementer || !newRecord.timing_id) {
      return NextResponse.json({ error: '必須フィールドが不足しています' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('precision_management_records')
      .insert(newRecord)
      .select();

    if (error) {
      console.error('API: 記録追加エラー:', error);
      return NextResponse.json({ 
        error: error.message, 
        details: error.details,
        code: error.code
      }, { status: 500 });
    }

    console.log('API: 精度管理記録が追加されました:', data?.[0]?.record_id);
    return NextResponse.json(data[0], { status: 201 });
  } catch (error) {
    console.error('API: リクエスト処理エラー:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'リクエスト処理エラー' 
    }, { status: 400 });
  }
} 
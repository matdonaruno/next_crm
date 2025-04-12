import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { format, subDays } from 'date-fns';

// 未入力の部署と機器を検出し通知を送信するAPIエンドポイント
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    // 1. 全ての部署と機器の組み合わせを取得
    const { data: departments, error: deptError } = await supabase.from('departments').select('*');
    
    if (deptError) {
      throw new Error(`部署情報の取得に失敗しました: ${deptError.message}`);
    }
    
    // 各部署の機器情報を取得
    const departmentEquipments = [];
    for (const dept of departments) {
      const { data: equipments, error: equipError } = await supabase
        .from('precision_management_equipments')
        .select('*')
        .eq('department_id', dept.id)
        .eq('is_active', true);
      
      if (equipError) {
        console.error(`${dept.name}の機器情報取得エラー: ${equipError.message}`);
        continue;
      }
      
      departmentEquipments.push({
        department: dept,
        equipments: equipments || []
      });
    }
    
    // 2. 昨日の日付を取得
    const yesterday = subDays(new Date(), 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    
    // 3. 昨日の記録が未入力の部署と機器を特定
    const missingRecords = [];
    
    for (const deptEquip of departmentEquipments) {
      const { department, equipments } = deptEquip;
      
      for (const equipment of equipments) {
        // 特定の機器の昨日の記録を確認
        const { data: records, error: recordError } = await supabase
          .from('precision_management_records')
          .select('*')
          .eq('department_id', department.id)
          .eq('pm_equipment_id', equipment.pm_equipment_id)
          .eq('implementation_date', yesterdayStr);
        
        if (recordError) {
          console.error(`記録取得エラー: ${recordError.message}`);
          continue;
        }
        
        // 記録が存在しない場合は未入力として記録
        if (!records || records.length === 0) {
          missingRecords.push({
            department_id: department.id,
            department_name: department.name,
            equipment_id: equipment.pm_equipment_id,
            equipment_name: equipment.equipment_name,
            date: yesterdayStr
          });
        }
      }
    }
    
    // 4. 通知データを返す
    return NextResponse.json({
      date: yesterdayStr,
      missing_records: missingRecords,
      total_missing: missingRecords.length
    });
    
  } catch (error) {
    console.error('通知生成エラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '通知の生成に失敗しました' },
      { status: 500 }
    );
  }
}

// 通知送信用のPOSTエンドポイント（例：Slackやメールに通知を送信）
export async function POST(request: NextRequest) {
  try {
    console.log('API: 通知送信リクエスト開始');
    const body = await request.json();
    
    // Slackのwebhook URLを取得
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    
    const { data: configData, error: configError } = await supabase.from('system_configurations').select('*').eq('key', 'slack_webhook_url').single();
    
    if (configError || !configData) {
      console.error('API: Slack Webhook URL取得エラー:', configError);
      return NextResponse.json({ error: 'Slack Webhook URLが設定されていません' }, { status: 500 });
    }
    
    const webhookUrl = configData.value;
    
    const { notifications, notification_type } = body;
    
    // ここで実際の通知送信処理を実装
    // 例: Slack通知、メール送信など
    
    // この例では、通知が送信されたことを記録するだけ
    const { data, error } = await supabase
      .from('notification_logs')
      .insert({
        notification_type: notification_type || 'missing_records',
        content: JSON.stringify(notifications),
        sent_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      throw new Error(`通知ログの保存に失敗しました: ${error.message}`);
    }
    
    return NextResponse.json({
      success: true,
      message: '通知が送信されました',
      log_id: data[0].id
    });
    
  } catch (error) {
    console.error('通知送信エラー:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '通知の送信に失敗しました' },
      { status: 500 }
    );
  }
} 
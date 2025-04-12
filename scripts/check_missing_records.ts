import { createClient } from '@supabase/supabase-js';
import { format, subDays } from 'date-fns';
// node-fetchの型定義問題を解決
import fetch from 'node-fetch';

import { 
  MissingRecord, 
  SlackNotificationBlock 
} from '../src/types/precision-management';

// 環境変数からSlack Webhook URLを取得
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface Department {
  id: string;
  name: string;
  [key: string]: any;
}

interface Equipment {
  pm_equipment_id: number;
  equipment_name: string;
  department_id: string;
  is_active: boolean;
  [key: string]: any;
}

interface DepartmentWithEquipments {
  department: Department;
  equipments: Equipment[];
}

// 未入力チェックを実行する関数
async function checkMissingRecords() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Supabase環境変数が設定されていません');
    process.exit(1);
  }

  // Supabaseクライアントの初期化
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 1. 全ての部署と機器の組み合わせを取得
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('*');
    
    if (deptError) {
      throw new Error(`部署情報の取得に失敗しました: ${deptError.message}`);
    }
    
    // 各部署の機器情報を取得
    const departmentEquipments: DepartmentWithEquipments[] = [];
    for (const dept of departments as Department[]) {
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
        equipments: equipments as Equipment[] || []
      });
    }
    
    // 2. 昨日の日付を取得
    const yesterday = subDays(new Date(), 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    
    // 3. 昨日の記録が未入力の部署と機器を特定
    const missingRecords: MissingRecord[] = [];
    
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
    
    // 4. 未入力がある場合はSlackに通知
    if (missingRecords.length > 0 && SLACK_WEBHOOK_URL) {
      await sendSlackNotification(missingRecords, yesterdayStr);
    }
    
    // 5. 通知ログを保存
    const { error: logError } = await supabase
      .from('notification_logs')
      .insert({
        notification_type: 'missing_records',
        content: JSON.stringify({
          date: yesterdayStr,
          missing_records: missingRecords,
          total_missing: missingRecords.length
        }),
        sent_at: new Date().toISOString()
      });
    
    if (logError) {
      console.error(`通知ログの保存に失敗しました: ${logError.message}`);
    }
    
    console.log(`チェック完了: ${missingRecords.length}件の未入力を検出しました`);
    if (missingRecords.length > 0) {
      console.log('未入力の詳細:');
      const groupedByDept: Record<string, string[]> = {};
      missingRecords.forEach(record => {
        if (!groupedByDept[record.department_name]) {
          groupedByDept[record.department_name] = [];
        }
        groupedByDept[record.department_name].push(record.equipment_name);
      });
      
      Object.entries(groupedByDept).forEach(([dept, equipments]) => {
        console.log(`- ${dept}: ${equipments.join(', ')}`);
      });
    }
    
  } catch (error) {
    console.error('未入力チェックエラー:', error);
  }
}

// Slackに通知を送信する関数
async function sendSlackNotification(missingRecords: MissingRecord[], date: string) {
  if (!SLACK_WEBHOOK_URL) return;
  
  // 部署ごとにグループ化
  const groupedByDept: Record<string, string[]> = {};
  missingRecords.forEach(record => {
    if (!groupedByDept[record.department_name]) {
      groupedByDept[record.department_name] = [];
    }
    groupedByDept[record.department_name].push(record.equipment_name);
  });
  
  // Slackメッセージを構築
  const blocks: SlackNotificationBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${date} の精度管理記録で未入力があります*\n${missingRecords.length}件の記録が未入力です。`
      }
    },
    {
      type: 'divider'
    }
  ];
  
  // 各部署の未入力情報を追加
  Object.entries(groupedByDept).forEach(([dept, equipments]) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${dept}*\n${equipments.join(', ')}`
      }
    });
  });
  
  // アクションボタンを追加（SlackNotificationBlock型に合わせて修正）
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '精度管理記録システムを開く',
          emoji: true
        },
        url: `${process.env.NEXT_PUBLIC_APP_URL}/precision-management`
      }
    ]
  } as SlackNotificationBlock); // 型アサーション
  
  // Slackに送信
  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        blocks
      })
    });
    
    if (!response.ok) {
      throw new Error(`Slack通知の送信に失敗しました: ${response.statusText}`);
    }
    
    console.log('Slack通知が送信されました');
  } catch (error) {
    console.error('Slack通知エラー:', error);
  }
}

// スクリプト実行
checkMissingRecords()
  .then(() => {
    console.log('チェック処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('スクリプト実行エラー:', error);
    process.exit(1);
  }); 
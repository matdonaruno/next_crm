// 機器登録用スクリプト
import { createClient } from '@supabase/supabase-js';

// 環境変数から取得するか、直接設定してください（実際の環境に合わせて）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || ''; // 管理者権限が必要です

const supabase = createClient(supabaseUrl, supabaseKey);

// 機器リスト
const equipmentList = [
  { name: '血液ガス分析装置', description: 'ABL90FLEX-LABO' },
  { name: '血液ガス分析装置', description: 'ABL90FLEX-NICU' },
  { name: '統合型尿分析システム', description: 'Atellica1500' },
  { name: '半自動尿分析装置', description: 'CLINITEK Advantus' },
  { name: 'テーブルトップ遠心機', description: 'KUBOTA A4000' },
  { name: '遠心機', description: 'SEROMATIC I' },
  { name: 'ユニバーサル冷却遠心機', description: 'KUBOTA 5930' },
  { name: '冷却小型遠心機', description: 'H-60R' },
  { name: 'マイクロチューブ遠心機 Eppendorf製', description: '5453' },
  { name: '全自動血液凝固測定装置', description: 'CN6000' },
  { name: '多項目血球自動分析装置', description: 'XN3100' },
  { name: '赤血球沈降速度測定装置', description: 'Quick eye-8' },
  { name: '微生物同定感受性分析装置', description: 'MiccroScan WalkAway 40Si' },
  { name: '多本架冷却遠心機', description: 'AX310BCU' },
  { name: 'マイクロチューブ遠心機 Eppendorf製', description: '5418' },
  { name: 'リアルタイムPCR装置', description: 'QuantStudio 5 DX' },
  { name: '自動核酸抽出精製機', description: 'Kingfisher Duo Prime' },
  { name: '全自動血液培養検査装置', description: 'VIRTUO' },
  { name: 'ディスクリート式臨床化学自動分析装置', description: 'TBA2000 FR' },
  { name: 'ディスクリート式臨床化学自動分析装置', description: 'TBA120FR' },
  { name: '生化学・免疫統合型自動分析装置', description: 'Cobas 8000' },
  { name: '全自動化学発光酵素免疫測定システム', description: 'Lumipalse G1200' },
  { name: '全自動化学発光免疫測定装置', description: 'archtect' },
  { name: 'グルコース分析装置', description: 'GA-1172' },
  { name: '全自動グリコヘモグロビン測定装置', description: 'HA-8190V' }
];

async function insertEquipment() {
  // 実際の管理施設IDと部門IDを設定してください
  const facilityId = '実際の管理施設ID'; // 実際のUUIDに置き換え
  const departmentId = '実際の部門ID';   // 実際のUUIDに置き換え
  
  console.log('機器登録を開始します...');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const item of equipmentList) {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .insert({
          name: item.name,
          description: item.description,
          facility_id: facilityId,
          department_id: departmentId
        });
        
      if (error) {
        console.error(`エラー (${item.name}): `, error);
        errorCount++;
      } else {
        console.log(`登録成功: ${item.name} (${item.description})`);
        successCount++;
      }
    } catch (e) {
      console.error(`例外発生 (${item.name}): `, e);
      errorCount++;
    }
    
    // 少し待機して連続リクエストによる問題を回避
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`登録完了: 成功=${successCount}, 失敗=${errorCount}, 合計=${equipmentList.length}`);
}

// 実行
insertEquipment().catch(console.error);

// 使用方法:
// 1. facility_idとdepartment_idを実際の値に置き換え
// 2. node -r ts-node/register equipment_insert_script.ts を実行 
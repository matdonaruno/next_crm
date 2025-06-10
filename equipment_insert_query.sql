-- 機器登録用SQLクエリ
-- facility_idは実際の管理施設のIDに置き換えてください
-- department_idは実際の部門IDに置き換えてください
-- 次のコマンドを実行する前に必ず値を確認してください

-- 変数設定（実際の値に置き換え）
DO $$
DECLARE
    facility_id UUID := '実際の管理施設のID'; -- ここを実際の管理施設IDに置き換え
    department_id UUID := '実際の部門ID';      -- ここを実際の部門IDに置き換え
BEGIN

-- 機器登録
INSERT INTO equipment (name, description, facility_id, department_id) VALUES
('血液ガス分析装置', 'ABL90FLEX-LABO', facility_id, department_id),
('血液ガス分析装置', 'ABL90FLEX-NICU', facility_id, department_id),
('統合型尿分析システム', 'Atellica1500', facility_id, department_id),
('半自動尿分析装置', 'CLINITEK Advantus', facility_id, department_id),
('テーブルトップ遠心機', 'KUBOTA A4000', facility_id, department_id),
('遠心機', 'SEROMATIC I', facility_id, department_id),
('ユニバーサル冷却遠心機', 'KUBOTA 5930', facility_id, department_id),
('冷却小型遠心機', 'H-60R', facility_id, department_id),
('マイクロチューブ遠心機 Eppendorf製', '5453', facility_id, department_id),
('全自動血液凝固測定装置', 'CN6000', facility_id, department_id),
('多項目血球自動分析装置', 'XN3100', facility_id, department_id),
('赤血球沈降速度測定装置', 'Quick eye-8', facility_id, department_id),
('微生物同定感受性分析装置', 'MiccroScan WalkAway 40Si', facility_id, department_id),
('多本架冷却遠心機', 'AX310BCU', facility_id, department_id),
('マイクロチューブ遠心機 Eppendorf製', '5418', facility_id, department_id),
('リアルタイムPCR装置', 'QuantStudio 5 DX', facility_id, department_id),
('自動核酸抽出精製機', 'Kingfisher Duo Prime', facility_id, department_id),
('全自動血液培養検査装置', 'VIRTUO', facility_id, department_id),
('ディスクリート式臨床化学自動分析装置', 'TBA2000 FR', facility_id, department_id),
('ディスクリート式臨床化学自動分析装置', 'TBA120FR', facility_id, department_id),
('生化学・免疫統合型自動分析装置', 'Cobas 8000', facility_id, department_id),
('全自動化学発光酵素免疫測定システム', 'Lumipalse G1200', facility_id, department_id),
('全自動化学発光免疫測定装置', 'archtect', facility_id, department_id),
('グルコース分析装置', 'GA-1172', facility_id, department_id),
('全自動グリコヘモグロビン測定装置', 'HA-8190V', facility_id, department_id);

-- 登録確認クエリ
RAISE NOTICE '登録された機器数: %', (SELECT COUNT(*) FROM equipment WHERE facility_id = facility_id);

END $$;

-- アプリケーションからSQLを実行する場合の参考例
/*
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function insertEquipment() {
  const facilityId = '実際の管理施設ID';
  const departmentId = '実際の部門ID';
  
  const equipment = [
    { name: '血液ガス分析装置', description: 'ABL90FLEX-LABO' },
    { name: '血液ガス分析装置', description: 'ABL90FLEX-NICU' },
    // 他の機器も同様に追加
  ];
  
  for (const item of equipment) {
    const { data, error } = await supabase
      .from('equipment')
      .insert({
        name: item.name,
        description: item.description,
        facility_id: facilityId,
        department_id: departmentId
      });
      
    if (error) console.error(`エラー (${item.name}): `, error);
    else console.log(`登録成功: ${item.name}`);
  }
}
*/ 
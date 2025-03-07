-- departmentsテーブルにfacility_idカラムを追加
ALTER TABLE departments ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

-- departmentsテーブルに行レベルセキュリティを有効化
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- 閲覧ポリシー: ユーザーは自分の施設の部署のみ閲覧可能
CREATE POLICY "Users can view departments from their facility" ON departments
  FOR SELECT
  USING (facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid()));

-- 挿入ポリシー: ユーザーは自分の施設の部署のみ挿入可能
CREATE POLICY "Users can insert departments for their facility" ON departments
  FOR INSERT
  WITH CHECK (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 更新ポリシー: ユーザーは自分の施設の部署のみ更新可能
CREATE POLICY "Users can update departments for their facility" ON departments
  FOR UPDATE
  USING (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 既存の部署に施設IDを設定するサンプルクエリ
-- 実際の運用では、正確な施設IDと部署IDを指定する必要があります
UPDATE departments 
SET facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
WHERE id IN ('部署ID1', '部署ID2', '部署ID3');

-- 施設IDごとの部署数を確認するクエリ
SELECT 
  f.id as facility_id, 
  f.name as facility_name, 
  COUNT(d.id) as department_count
FROM facilities f
LEFT JOIN departments d ON f.id = d.facility_id
GROUP BY f.id, f.name
ORDER BY facility_name; 
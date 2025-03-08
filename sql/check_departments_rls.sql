-- 部署テーブルのRLS設定を確認するSQL

-- 現在のRLSの状態を確認
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'departments';

-- 現在のRLSポリシーを確認
SELECT * FROM pg_policies WHERE tablename = 'departments';

-- RLSを一時的に無効化して部署データを確認（テスト用、本番環境では注意）
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

-- 部署データを確認
SELECT * FROM departments;

-- 特定の施設IDに関連する部署を確認
SELECT * FROM departments WHERE facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac';

-- 施設IDの形式を確認（末尾の空白や制御文字を検出）
SELECT 
  id, 
  name, 
  facility_id, 
  LENGTH(facility_id) as id_length,
  ENCODE(CONVERT_TO(facility_id, 'UTF8'), 'hex') as hex_representation
FROM departments;

-- 部署テーブルに施設IDを設定（既存のデータがある場合）
UPDATE departments
SET facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
WHERE facility_id IS NULL OR facility_id != 'bd4e7203-2170-41a0-a6c5-c8235bab47ac';

-- RLSを再度有効化（必要に応じて）
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- RLSポリシーを設定（既存のポリシーがない場合）
CREATE POLICY "Enable read access for all users" ON departments
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON departments
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update for users based on facility_id" ON departments
    FOR UPDATE USING (
        facility_id IN (
            SELECT facility_id FROM profiles WHERE id = auth.uid()
        )
    );

-- 施設IDごとの部署数を確認
SELECT 
  facility_id,
  COUNT(*) as department_count
FROM departments
GROUP BY facility_id; 
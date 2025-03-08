-- 既存の部署データに施設IDを設定するSQLクエリ
-- 施設ID: bd4e7203-2170-41a0-a6c5-c8235bab47ac

-- 部署テーブルの現在の状態を確認
SELECT * FROM departments;

-- 特定の部署IDに施設IDを設定
UPDATE departments
SET facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
WHERE id IN (
  '32a13065-6d48-452f-a12d-a0af03681838', -- 血液・凝固
  '784f06f3-b64c-4ade-8f67-033d9b97397b', -- 生理
  '917695ff-55cf-4e39-b790-da7cbbd5b2a2', -- 生化学・免疫
  '929690b4-f6a3-4eea-975d-9ee4bfe600f2', -- 輸血
  'a67eec2d-abda-4fee-a29c-9bcf4f25aee2', -- 病理
  'aff528a3-7335-41b2-bb19-fa8c483ee543', -- 細菌
  'c9376234-4fac-4ee6-a2f6-01245d40f4ae', -- 時間外
  'f7f38c71-c5a3-48da-b38b-226c57c487dc', -- 一般
  'fc9118cd-57cf-4e70-8c4c-c500fd0d2537'  -- 血液ガス
);

-- すべての部署に施設IDを設定（上記の特定部署IDがない場合）
-- 注意: 複数の施設がある場合は使用しないでください
UPDATE departments
SET facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
WHERE facility_id IS NULL;

-- 更新後の部署テーブルの状態を確認
SELECT * FROM departments;

-- 施設IDごとの部署数を確認
SELECT 
  facility_id,
  COUNT(*) as department_count
FROM departments
GROUP BY facility_id; 
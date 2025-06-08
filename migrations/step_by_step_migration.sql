-- 段階的マイグレーション（1つずつ実行してください）

-- Step 1: is_confirmedカラム追加
ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE;

-- Step 2: confirmed_atカラム追加  
ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Step 3: confirmed_byカラム追加
ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS confirmed_by UUID;

-- Step 4: 外部キー制約追加（profiles参照）
ALTER TABLE meeting_minutes 
ADD CONSTRAINT meeting_minutes_confirmed_by_fkey 
FOREIGN KEY (confirmed_by) REFERENCES profiles(id);

-- Step 5: インデックス追加
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_confirmed 
ON meeting_minutes(facility_id, is_confirmed);

-- Step 6: processing_statusインデックス追加
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_processing_status 
ON meeting_minutes(facility_id, processing_status);
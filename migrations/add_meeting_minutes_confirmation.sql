-- 議事録確定機能のためのカラム追加
-- meeting_minutes テーブルに確定関連のカラムを追加

ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES profiles(id);

-- 既存のprocessing_statusにconfirmedを追加（enumを更新）
-- 注: PostgreSQLでのenum更新は複雑なので、制約チェックで代用
ALTER TABLE meeting_minutes 
DROP CONSTRAINT IF EXISTS valid_processing_status;

ALTER TABLE meeting_minutes 
ADD CONSTRAINT valid_processing_status 
CHECK (processing_status IN ('pending', 'processing', 'done', 'error', 'confirmed'));

-- インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_confirmed 
ON meeting_minutes(facility_id, is_confirmed);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_processing_status 
ON meeting_minutes(facility_id, processing_status);

-- コメント追加
COMMENT ON COLUMN meeting_minutes.is_confirmed IS '議事録が確定されているかどうか';
COMMENT ON COLUMN meeting_minutes.confirmed_at IS '議事録が確定された日時';
COMMENT ON COLUMN meeting_minutes.confirmed_by IS '議事録を確定したユーザーID';
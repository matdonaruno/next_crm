-- 議事録確定機能のためのカラム追加（Supabase対応版）
-- meeting_minutes テーブルに確定関連のカラムを追加

-- Step 1: カラム追加（個別に実行）
ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE;

ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE meeting_minutes 
ADD COLUMN IF NOT EXISTS confirmed_by UUID;

-- Step 2: 外部キー制約追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'meeting_minutes_confirmed_by_fkey'
    ) THEN
        ALTER TABLE meeting_minutes 
        ADD CONSTRAINT meeting_minutes_confirmed_by_fkey 
        FOREIGN KEY (confirmed_by) REFERENCES profiles(id);
    END IF;
END $$;

-- Step 3: 現在のenum型を確認してから更新
DO $$
DECLARE
    enum_exists boolean;
    enum_name text;
BEGIN
    -- processing_statusカラムの型を確認
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meeting_minutes' 
        AND column_name = 'processing_status'
        AND udt_name LIKE '%enum%'
    ) INTO enum_exists;
    
    IF enum_exists THEN
        -- enum型の名前を取得
        SELECT udt_name INTO enum_name
        FROM information_schema.columns 
        WHERE table_name = 'meeting_minutes' 
        AND column_name = 'processing_status';
        
        -- 既存のenum値を確認
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = enum_name
            AND e.enumlabel = 'confirmed'
        ) THEN
            -- 'confirmed'値を追加
            EXECUTE format('ALTER TYPE %s ADD VALUE ''confirmed''', enum_name);
        END IF;
    ELSE
        -- enum型でない場合は制約で対応
        ALTER TABLE meeting_minutes 
        DROP CONSTRAINT IF EXISTS valid_processing_status;
        
        ALTER TABLE meeting_minutes 
        ADD CONSTRAINT valid_processing_status 
        CHECK (processing_status IN ('pending', 'processing', 'done', 'error', 'confirmed'));
    END IF;
END $$;

-- Step 4: インデックス追加
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_confirmed 
ON meeting_minutes(facility_id, is_confirmed);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_processing_status 
ON meeting_minutes(facility_id, processing_status);

-- Step 5: コメント追加
COMMENT ON COLUMN meeting_minutes.is_confirmed IS '議事録が確定されているかどうか';
COMMENT ON COLUMN meeting_minutes.confirmed_at IS '議事録が確定された日時';
COMMENT ON COLUMN meeting_minutes.confirmed_by IS '議事録を確定したユーザーID';
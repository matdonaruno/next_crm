-- weekly_temperature_verificationsテーブルの作成
CREATE TABLE IF NOT EXISTS weekly_temperature_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  week_start_date DATE NOT NULL,
  week_end_date DATE,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_by UUID REFERENCES auth.users(id),
  comments TEXT,
  has_anomalies BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(facility_id, department_id, week_start_date)
);

-- インデックスの作成（検索効率化のため）
CREATE INDEX IF NOT EXISTS weekly_temperature_verifications_facility_idx ON weekly_temperature_verifications(facility_id);
CREATE INDEX IF NOT EXISTS weekly_temperature_verifications_department_idx ON weekly_temperature_verifications(department_id);
CREATE INDEX IF NOT EXISTS weekly_temperature_verifications_week_start_idx ON weekly_temperature_verifications(week_start_date);
CREATE INDEX IF NOT EXISTS weekly_temperature_verifications_verified_by_idx ON weekly_temperature_verifications(verified_by);

-- RLSポリシーの設定（セキュリティのため）
ALTER TABLE weekly_temperature_verifications ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "週次確認データを全ユーザーが読める" 
  ON weekly_temperature_verifications FOR SELECT 
  USING (true);

-- 認証済みユーザーのみ作成・更新可能
CREATE POLICY "認証済みユーザーのみ週次確認データを作成できる" 
  ON weekly_temperature_verifications FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "認証済みユーザーのみ週次確認データを更新できる" 
  ON weekly_temperature_verifications FOR UPDATE 
  TO authenticated 
  USING (true);

-- 機能説明コメント
COMMENT ON TABLE weekly_temperature_verifications IS '週ごとの温度確認記録を保存するテーブル';
COMMENT ON COLUMN weekly_temperature_verifications.facility_id IS '施設ID';
COMMENT ON COLUMN weekly_temperature_verifications.department_id IS '部署ID';
COMMENT ON COLUMN weekly_temperature_verifications.week_start_date IS '週の開始日（月曜日）';
COMMENT ON COLUMN weekly_temperature_verifications.week_end_date IS '週の終了日（日曜日）';
COMMENT ON COLUMN weekly_temperature_verifications.verified_at IS '確認日時';
COMMENT ON COLUMN weekly_temperature_verifications.verified_by IS '確認者のユーザーID';
COMMENT ON COLUMN weekly_temperature_verifications.comments IS '確認時のコメント';
COMMENT ON COLUMN weekly_temperature_verifications.has_anomalies IS '異常の有無フラグ'; 
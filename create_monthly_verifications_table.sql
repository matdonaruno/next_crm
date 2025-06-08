-- monthly_temperature_verificationsテーブルの作成
CREATE TABLE IF NOT EXISTS monthly_temperature_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  year_month TEXT NOT NULL, -- YYYY-MM形式で月を保存
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_by UUID REFERENCES auth.users(id),
  comments TEXT,
  has_anomalies BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(facility_id, department_id, year_month)
);

-- インデックスの作成（検索効率化のため）
CREATE INDEX IF NOT EXISTS monthly_temperature_verifications_facility_idx ON monthly_temperature_verifications(facility_id);
CREATE INDEX IF NOT EXISTS monthly_temperature_verifications_department_idx ON monthly_temperature_verifications(department_id);
CREATE INDEX IF NOT EXISTS monthly_temperature_verifications_year_month_idx ON monthly_temperature_verifications(year_month);
CREATE INDEX IF NOT EXISTS monthly_temperature_verifications_verified_by_idx ON monthly_temperature_verifications(verified_by);

-- RLSポリシーの設定（セキュリティのため）
ALTER TABLE monthly_temperature_verifications ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "月次確認データを全ユーザーが読める" 
  ON monthly_temperature_verifications FOR SELECT 
  USING (true);

-- 管理者ユーザーのみ作成・更新可能
CREATE POLICY "管理者のみ月次確認データを作成できる" 
  ON monthly_temperature_verifications FOR INSERT 
  TO authenticated 
  USING (
    -- 管理者権限を持つユーザーのみ許可
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 
      (profiles.role = 'admin' OR profiles.role = 'facility_admin' OR profiles.role = 'superuser')
    )
  );

CREATE POLICY "管理者のみ月次確認データを更新できる" 
  ON monthly_temperature_verifications FOR UPDATE 
  TO authenticated
  USING (
    -- 管理者権限を持つユーザーのみ許可
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND 
      (profiles.role = 'admin' OR profiles.role = 'facility_admin' OR profiles.role = 'superuser')
    )
  );

-- 機能説明コメント
COMMENT ON TABLE monthly_temperature_verifications IS '月ごとの温度確認記録を保存するテーブル';
COMMENT ON COLUMN monthly_temperature_verifications.facility_id IS '施設ID';
COMMENT ON COLUMN monthly_temperature_verifications.department_id IS '部署ID';
COMMENT ON COLUMN monthly_temperature_verifications.year_month IS '年月（YYYY-MM形式）';
COMMENT ON COLUMN monthly_temperature_verifications.verified_at IS '確認日時';
COMMENT ON COLUMN monthly_temperature_verifications.verified_by IS '確認者のユーザーID';
COMMENT ON COLUMN monthly_temperature_verifications.comments IS '確認時のコメント';
COMMENT ON COLUMN monthly_temperature_verifications.has_anomalies IS '異常の有無フラグ'; 
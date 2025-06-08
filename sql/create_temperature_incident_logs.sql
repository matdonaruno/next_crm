-- 温度インシデントログテーブルの作成
CREATE TABLE IF NOT EXISTS temperature_incident_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  incident_date TIMESTAMP WITH TIME ZONE NOT NULL,
  detected_temperature DECIMAL(5,2) NOT NULL,
  threshold_min DECIMAL(5,2) NOT NULL,
  threshold_max DECIMAL(5,2) NOT NULL,
  detection_method TEXT NOT NULL CHECK (detection_method IN ('sensor', 'manual', 'notification')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  response_taken TEXT NOT NULL,
  response_result TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_comment TEXT
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS temperature_incident_logs_facility_id_idx ON temperature_incident_logs(facility_id);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_department_id_idx ON temperature_incident_logs(department_id);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_incident_date_idx ON temperature_incident_logs(incident_date);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_severity_idx ON temperature_incident_logs(severity);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_resolved_at_idx ON temperature_incident_logs(resolved_at);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_approval_status_idx ON temperature_incident_logs(approval_status);
CREATE INDEX IF NOT EXISTS temperature_incident_logs_approved_at_idx ON temperature_incident_logs(approved_at);

-- RLS (Row Level Security) ポリシーの設定
ALTER TABLE temperature_incident_logs ENABLE ROW LEVEL SECURITY;

-- すべてのユーザーが閲覧可能
CREATE POLICY temperature_incident_logs_select_policy
  ON temperature_incident_logs
  FOR SELECT
  USING (true);

-- 認証済みユーザーのみ挿入可能
CREATE POLICY temperature_incident_logs_insert_policy
  ON temperature_incident_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 作成者または管理者のみ基本データを更新可能
CREATE POLICY temperature_incident_logs_update_policy
  ON temperature_incident_logs
  FOR UPDATE
  USING (
    auth.uid() = created_by
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('superuser', 'facility_admin', 'approver')
    )
  );

-- 承認者以上のロールのみが承認ステータスを更新可能
CREATE POLICY temperature_incident_logs_approve_policy
  ON temperature_incident_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('superuser', 'facility_admin', 'approver')
    )
  )
  WITH CHECK (
    approval_status IS NOT NULL AND
    approved_by = auth.uid() AND
    approved_at IS NOT NULL
  );

-- 施設管理者以上のロールのみ削除可能
CREATE POLICY temperature_incident_logs_delete_policy
  ON temperature_incident_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('superuser', 'facility_admin')
    )
  );

-- コメント
COMMENT ON TABLE temperature_incident_logs IS '温度異常の発生と対応を記録するテーブル';
COMMENT ON COLUMN temperature_incident_logs.incident_date IS '温度異常が発生した日時';
COMMENT ON COLUMN temperature_incident_logs.detected_temperature IS '検知された温度';
COMMENT ON COLUMN temperature_incident_logs.threshold_min IS '許容範囲の最低温度';
COMMENT ON COLUMN temperature_incident_logs.threshold_max IS '許容範囲の最高温度';
COMMENT ON COLUMN temperature_incident_logs.detection_method IS '検知方法（センサー、手動、通知）';
COMMENT ON COLUMN temperature_incident_logs.severity IS '重要度（低、中、高、重大）';
COMMENT ON COLUMN temperature_incident_logs.response_taken IS '実施した対応措置';
COMMENT ON COLUMN temperature_incident_logs.response_result IS '対応の結果';
COMMENT ON COLUMN temperature_incident_logs.resolved_at IS '解決した日時';
COMMENT ON COLUMN temperature_incident_logs.resolved_by IS '解決した担当者';
COMMENT ON COLUMN temperature_incident_logs.created_at IS 'レコード作成日時';
COMMENT ON COLUMN temperature_incident_logs.created_by IS 'レコード作成者';
COMMENT ON COLUMN temperature_incident_logs.approval_status IS '承認ステータス（保留中、承認済、却下）';
COMMENT ON COLUMN temperature_incident_logs.approved_by IS '承認者のID';
COMMENT ON COLUMN temperature_incident_logs.approved_at IS '承認日時';
COMMENT ON COLUMN temperature_incident_logs.approval_comment IS '承認時のコメント'; 
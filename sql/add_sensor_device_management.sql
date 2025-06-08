-- センサーデバイス管理機能の拡張
-- ESP8266デバイスのトークン認証、診断情報、バッテリー警告に対応

-- sensor_devicesテーブルにauth_tokenカラムが存在しない場合は追加
ALTER TABLE sensor_devices ADD COLUMN IF NOT EXISTS auth_token TEXT;
ALTER TABLE sensor_devices ADD COLUMN IF NOT EXISTS last_connection TIMESTAMP WITH TIME ZONE;
ALTER TABLE sensor_devices ADD COLUMN IF NOT EXISTS note TEXT;

-- auth_tokenにインデックスを追加（高速検索用）
CREATE INDEX IF NOT EXISTS idx_sensor_devices_auth_token ON sensor_devices(auth_token) WHERE auth_token IS NOT NULL;

-- センサー診断ログテーブルの作成
CREATE TABLE IF NOT EXISTS sensor_diagnostic_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_device_id UUID REFERENCES sensor_devices(id),
  device_id TEXT,
  aht_status TEXT,
  bmp_status TEXT,
  battery_voltage FLOAT,
  ip_address TEXT,
  diagnostic_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_sensor_diagnostic_device ON sensor_diagnostic_logs(sensor_device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_diagnostic_created ON sensor_diagnostic_logs(created_at);

-- バッテリー警告ログテーブルの作成
CREATE TABLE IF NOT EXISTS sensor_battery_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_device_id UUID REFERENCES sensor_devices(id),
  device_id TEXT,
  device_name TEXT,
  battery_voltage FLOAT,
  alert_type TEXT DEFAULT 'low_battery',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_battery_alerts_device ON sensor_battery_alerts(sensor_device_id);
CREATE INDEX IF NOT EXISTS idx_battery_alerts_created ON sensor_battery_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_battery_alerts_acknowledged ON sensor_battery_alerts(acknowledged);

-- RLSポリシーの設定
ALTER TABLE sensor_diagnostic_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_battery_alerts ENABLE ROW LEVEL SECURITY;

-- 診断ログは全ユーザーが閲覧可能（管理者のみ削除可能）
CREATE POLICY sensor_diagnostic_logs_select ON sensor_diagnostic_logs
  FOR SELECT USING (true);

CREATE POLICY sensor_diagnostic_logs_insert ON sensor_diagnostic_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY sensor_diagnostic_logs_delete ON sensor_diagnostic_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superuser', 'facility_admin')
    )
  );

-- バッテリー警告は全ユーザーが閲覧可能、管理者のみ更新可能
CREATE POLICY sensor_battery_alerts_select ON sensor_battery_alerts
  FOR SELECT USING (true);

CREATE POLICY sensor_battery_alerts_insert ON sensor_battery_alerts
  FOR INSERT WITH CHECK (true);

CREATE POLICY sensor_battery_alerts_update ON sensor_battery_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superuser', 'facility_admin')
    )
  );

-- コメント追加
COMMENT ON COLUMN sensor_devices.auth_token IS 'ESP8266デバイスの認証トークン（32文字のランダム文字列）';
COMMENT ON COLUMN sensor_devices.last_connection IS '最後にデバイスから接続があった時刻';
COMMENT ON TABLE sensor_diagnostic_logs IS 'センサーデバイスの診断情報ログ';
COMMENT ON TABLE sensor_battery_alerts IS 'センサーデバイスのバッテリー低下警告ログ';
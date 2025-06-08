-- Migration: センサーデバイス認証機能の追加（Supabase最適化版）
-- Date: 2025-06-07
-- Description: ESP8266デバイスのトークン認証、診断情報、バッテリー警告に対応

-- ========================================
-- 1. sensor_devicesテーブルの拡張
-- ========================================

-- auth_tokenカラムの追加
ALTER TABLE sensor_devices 
ADD COLUMN IF NOT EXISTS auth_token TEXT;

-- last_connectionカラムの追加
ALTER TABLE sensor_devices 
ADD COLUMN IF NOT EXISTS last_connection TIMESTAMP WITH TIME ZONE;

-- noteカラムの追加（既存の場合はスキップ）
ALTER TABLE sensor_devices 
ADD COLUMN IF NOT EXISTS note TEXT;

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_sensor_devices_auth_token 
  ON sensor_devices(auth_token) 
  WHERE auth_token IS NOT NULL;

-- ========================================
-- 2. センサー診断ログテーブルの作成
-- ========================================

CREATE TABLE IF NOT EXISTS sensor_diagnostic_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_device_id UUID REFERENCES sensor_devices(id) ON DELETE CASCADE,
  device_id TEXT,
  aht_status TEXT,
  bmp_status TEXT,
  battery_voltage FLOAT,
  ip_address TEXT,
  diagnostic_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 制約
  CONSTRAINT sensor_diagnostic_logs_sensor_device_id_fkey 
    FOREIGN KEY (sensor_device_id) 
    REFERENCES sensor_devices(id) 
    ON DELETE CASCADE
);

-- 診断ログのインデックス
CREATE INDEX IF NOT EXISTS idx_sensor_diagnostic_device 
  ON sensor_diagnostic_logs(sensor_device_id);
  
CREATE INDEX IF NOT EXISTS idx_sensor_diagnostic_created 
  ON sensor_diagnostic_logs(created_at DESC);

-- ========================================
-- 3. バッテリー警告ログテーブルの作成
-- ========================================

CREATE TABLE IF NOT EXISTS sensor_battery_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_device_id UUID REFERENCES sensor_devices(id) ON DELETE CASCADE,
  device_id TEXT,
  device_name TEXT,
  battery_voltage FLOAT NOT NULL,
  alert_type TEXT DEFAULT 'low_battery',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  
  -- 制約
  CONSTRAINT sensor_battery_alerts_sensor_device_id_fkey 
    FOREIGN KEY (sensor_device_id) 
    REFERENCES sensor_devices(id) 
    ON DELETE CASCADE,
    
  CONSTRAINT sensor_battery_alerts_acknowledged_by_fkey 
    FOREIGN KEY (acknowledged_by) 
    REFERENCES auth.users(id)
    ON DELETE SET NULL,
    
  -- バッテリー電圧の妥当性チェック
  CONSTRAINT battery_voltage_check 
    CHECK (battery_voltage >= 0 AND battery_voltage <= 10)
);

-- バッテリー警告のインデックス
CREATE INDEX IF NOT EXISTS idx_battery_alerts_device 
  ON sensor_battery_alerts(sensor_device_id);
  
CREATE INDEX IF NOT EXISTS idx_battery_alerts_created 
  ON sensor_battery_alerts(created_at DESC);
  
CREATE INDEX IF NOT EXISTS idx_battery_alerts_acknowledged 
  ON sensor_battery_alerts(acknowledged) 
  WHERE acknowledged = FALSE;

-- ========================================
-- 4. RLS（Row Level Security）の設定
-- ========================================

-- RLSを有効化
ALTER TABLE sensor_diagnostic_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_battery_alerts ENABLE ROW LEVEL SECURITY;

-- 診断ログのポリシー
-- 全ユーザーが閲覧可能
CREATE POLICY "sensor_diagnostic_logs_select_policy" ON sensor_diagnostic_logs
  FOR SELECT 
  TO authenticated
  USING (true);

-- システムとサービスロールのみ挿入可能
CREATE POLICY "sensor_diagnostic_logs_insert_policy" ON sensor_diagnostic_logs
  FOR INSERT 
  TO authenticated, service_role
  WITH CHECK (true);

-- 管理者のみ削除可能
CREATE POLICY "sensor_diagnostic_logs_delete_policy" ON sensor_diagnostic_logs
  FOR DELETE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superuser', 'facility_admin')
    )
  );

-- バッテリー警告のポリシー
-- 全ユーザーが閲覧可能
CREATE POLICY "sensor_battery_alerts_select_policy" ON sensor_battery_alerts
  FOR SELECT 
  TO authenticated
  USING (true);

-- システムとサービスロールのみ挿入可能
CREATE POLICY "sensor_battery_alerts_insert_policy" ON sensor_battery_alerts
  FOR INSERT 
  TO authenticated, service_role
  WITH CHECK (true);

-- 管理者のみ更新可能（確認処理用）
CREATE POLICY "sensor_battery_alerts_update_policy" ON sensor_battery_alerts
  FOR UPDATE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('superuser', 'facility_admin')
    )
  );

-- ========================================
-- 5. コメントの追加（ドキュメント化）
-- ========================================

COMMENT ON COLUMN sensor_devices.auth_token 
  IS 'ESP8266デバイスの認証トークン（32文字のランダム文字列）';
  
COMMENT ON COLUMN sensor_devices.last_connection 
  IS '最後にデバイスから接続があった時刻';
  
COMMENT ON TABLE sensor_diagnostic_logs 
  IS 'センサーデバイスの診断情報ログ（センサー状態、バッテリー電圧など）';
  
COMMENT ON TABLE sensor_battery_alerts 
  IS 'センサーデバイスのバッテリー低下警告ログ';

COMMENT ON COLUMN sensor_battery_alerts.acknowledged 
  IS '管理者による確認済みフラグ';

-- ========================================
-- 6. 既存データの移行
-- ========================================

-- last_seenの値をlast_connectionにコピー（初期値として）
UPDATE sensor_devices 
SET last_connection = last_seen 
WHERE last_connection IS NULL AND last_seen IS NOT NULL;

-- ========================================
-- 7. 追加のセキュリティ設定
-- ========================================

-- auth_tokenを更新できるのは管理者のみ
CREATE POLICY "sensor_devices_auth_token_update_policy" ON sensor_devices
  FOR UPDATE
  USING (
    -- 既存のポリシーと組み合わせ
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('superuser', 'facility_admin')
        OR (profiles.facility_id = sensor_devices.facility_id)
      )
    )
  )
  WITH CHECK (
    -- auth_tokenの更新は管理者のみ
    CASE 
      WHEN auth_token IS DISTINCT FROM OLD.auth_token THEN
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('superuser', 'facility_admin')
        )
      ELSE true
    END
  );

-- ========================================
-- 8. ビューの作成（オプション）
-- ========================================

-- 最近のバッテリー警告ビュー
CREATE OR REPLACE VIEW recent_battery_alerts AS
SELECT 
  sba.id,
  sba.sensor_device_id,
  sd.device_name,
  sd.location,
  sba.battery_voltage,
  sba.created_at,
  sba.acknowledged,
  sba.acknowledged_at,
  p.fullname as acknowledged_by_name
FROM sensor_battery_alerts sba
LEFT JOIN sensor_devices sd ON sd.id = sba.sensor_device_id
LEFT JOIN profiles p ON p.id = sba.acknowledged_by
WHERE sba.created_at > NOW() - INTERVAL '7 days'
ORDER BY sba.created_at DESC;

-- ビューにコメント追加
COMMENT ON VIEW recent_battery_alerts 
  IS '過去7日間のバッテリー警告一覧';

-- ========================================
-- 実行確認用のテストクエリ
-- ========================================
-- 以下のクエリで正常に実行されたか確認できます：
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'sensor_devices' 
-- AND column_name IN ('auth_token', 'last_connection');
-- 
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_name IN ('sensor_diagnostic_logs', 'sensor_battery_alerts');
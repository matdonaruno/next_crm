-- 追加の改善提案（オプション）
-- センサーデバイス認証機能の改善

-- ========================================
-- 1. 重複警告防止機能
-- ========================================

-- バッテリー警告の重複チェック用関数
CREATE OR REPLACE FUNCTION check_recent_battery_alert(
  p_device_id UUID,
  p_voltage FLOAT,
  p_interval INTERVAL DEFAULT '1 hour'
) RETURNS BOOLEAN AS $$
BEGIN
  -- 指定期間内に同じデバイスから警告があったかチェック
  RETURN EXISTS (
    SELECT 1 
    FROM sensor_battery_alerts
    WHERE sensor_device_id = p_device_id
    AND created_at > NOW() - p_interval
    AND ABS(battery_voltage - p_voltage) < 0.1  -- 電圧差が0.1V未満なら同一とみなす
  );
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 2. データ保持期間の自動管理
-- ========================================

-- 古いログを削除する関数
CREATE OR REPLACE FUNCTION cleanup_old_sensor_logs() RETURNS void AS $$
BEGIN
  -- 90日以上前の診断ログを削除
  DELETE FROM sensor_diagnostic_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 1年以上前の確認済みバッテリー警告を削除
  DELETE FROM sensor_battery_alerts 
  WHERE created_at < NOW() - INTERVAL '1 year'
  AND acknowledged = true;
  
  -- 処理済みのセンサーログを削除（30日以上前）
  DELETE FROM sensor_logs 
  WHERE recorded_at < NOW() - INTERVAL '30 days'
  AND is_processed = true;
END;
$$ LANGUAGE plpgsql;

-- 定期実行用のcronジョブ（pg_cronが有効な場合）
-- SELECT cron.schedule('cleanup-sensor-logs', '0 2 * * *', 'SELECT cleanup_old_sensor_logs();');

-- ========================================
-- 3. デバイス統計ビュー
-- ========================================

CREATE OR REPLACE VIEW sensor_device_statistics AS
SELECT 
  sd.id,
  sd.device_id,
  sd.device_name,
  sd.location,
  sd.last_connection,
  -- 最新のセンサー値
  (SELECT raw_data->>'ahtTemp' FROM sensor_logs 
   WHERE sensor_device_id = sd.id 
   ORDER BY recorded_at DESC LIMIT 1)::FLOAT as latest_temperature,
  -- 最新のバッテリー電圧
  (SELECT raw_data->>'batteryVolt' FROM sensor_logs 
   WHERE sensor_device_id = sd.id 
   ORDER BY recorded_at DESC LIMIT 1)::FLOAT as latest_battery_voltage,
  -- 未確認警告数
  (SELECT COUNT(*) FROM sensor_battery_alerts 
   WHERE sensor_device_id = sd.id 
   AND acknowledged = false) as unacknowledged_alerts,
  -- 接続状態（1時間以内に接続があれば「オンライン」）
  CASE 
    WHEN sd.last_connection > NOW() - INTERVAL '1 hour' THEN 'online'
    WHEN sd.last_connection > NOW() - INTERVAL '24 hours' THEN 'idle'
    ELSE 'offline'
  END as connection_status
FROM sensor_devices sd
WHERE sd.is_active = true;

-- ========================================
-- 4. トークン有効期限管理（将来の拡張用）
-- ========================================

-- トークン有効期限カラムの追加（オプション）
ALTER TABLE sensor_devices 
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP WITH TIME ZONE;

-- トークン有効期限チェック関数
CREATE OR REPLACE FUNCTION is_token_valid(
  p_device_id TEXT,
  p_token TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_device RECORD;
BEGIN
  SELECT auth_token, token_expires_at 
  INTO v_device
  FROM sensor_devices 
  WHERE device_id = p_device_id;
  
  -- トークンが一致し、有効期限内（または無期限）
  RETURN v_device.auth_token = p_token 
    AND (v_device.token_expires_at IS NULL 
         OR v_device.token_expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. 通知設定テーブル（将来の拡張用）
-- ========================================

CREATE TABLE IF NOT EXISTS sensor_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID REFERENCES facilities(id),
  notification_type TEXT NOT NULL, -- 'battery_alert', 'sensor_error', etc
  enabled BOOLEAN DEFAULT true,
  threshold_value FLOAT, -- バッテリー電圧の閾値など
  notification_interval INTERVAL DEFAULT '1 hour', -- 通知の最小間隔
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(facility_id, notification_type)
);

-- RLS設定
ALTER TABLE sensor_notification_settings ENABLE ROW LEVEL SECURITY;

-- 管理者のみ編集可能
CREATE POLICY "notification_settings_policy" ON sensor_notification_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role IN ('superuser')
        OR (profiles.role = 'facility_admin' AND profiles.facility_id = sensor_notification_settings.facility_id)
      )
    )
  );

-- ========================================
-- 6. 監査ログ（オプション）
-- ========================================

CREATE TABLE IF NOT EXISTS sensor_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_device_id UUID REFERENCES sensor_devices(id),
  action TEXT NOT NULL, -- 'token_changed', 'device_registered', etc
  performed_by UUID REFERENCES auth.users(id),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_sensor_audit_device ON sensor_audit_logs(sensor_device_id);
CREATE INDEX idx_sensor_audit_created ON sensor_audit_logs(created_at DESC);
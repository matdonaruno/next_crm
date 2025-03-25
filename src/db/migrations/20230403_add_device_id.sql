-- IPアドレスからデバイスID (MACアドレス由来) への移行マイグレーション

-- sensor_devicesテーブルにdevice_idカラムを追加
ALTER TABLE sensor_devices ADD COLUMN IF NOT EXISTS device_id TEXT;

-- sensor_logsテーブルにdevice_idカラムを追加
ALTER TABLE sensor_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_sensor_devices_device_id ON sensor_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_logs_device_id ON sensor_logs(device_id);

-- 以下のコメントはデータ更新時に参考にすること
-- 既存のMACアドレスがある場合は、それをdevice_idとしてコピーする例:
-- UPDATE sensor_devices SET device_id = REPLACE(mac_address, ':', '') WHERE mac_address IS NOT NULL;

-- Supabaseデータベースに適用するときの注意:
-- このマイグレーションはテーブル構造のみを変更します。
-- 実際のデータ移行はUIで行うか、別途SQLスクリプトを作成してください。 
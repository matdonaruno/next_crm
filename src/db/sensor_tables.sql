-- センサーデバイス管理テーブル
CREATE TABLE IF NOT EXISTS sensor_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_name TEXT NOT NULL,
  ip_address TEXT,
  mac_address TEXT,
  facility_id UUID REFERENCES facilities(id),
  department_id UUID REFERENCES departments(id),
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active',
  auth_token TEXT
);

-- センサーマッピングテーブル
CREATE TABLE IF NOT EXISTS sensor_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_device_id UUID REFERENCES sensor_devices(id),
  sensor_type TEXT NOT NULL, -- 'ahtTemp', 'bmpTemp', 'ahtHum', 'bmpPres'など
  temperature_item_id UUID REFERENCES temperature_items(id),
  offset_value FLOAT DEFAULT 0, -- センサー補正値
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- センサーログテーブル
CREATE TABLE IF NOT EXISTS sensor_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_device_id UUID REFERENCES sensor_devices(id),
  raw_data JSONB,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT
);

-- 既存のテーブルにカラムを追加
ALTER TABLE temperature_records ADD COLUMN IF NOT EXISTS is_auto_recorded BOOLEAN DEFAULT FALSE;
ALTER TABLE temperature_record_details ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual';

-- センサーデータソース用のインデックス
CREATE INDEX IF NOT EXISTS idx_sensor_logs_recorded_at ON sensor_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_sensor_devices_ip ON sensor_devices(ip_address);
CREATE INDEX IF NOT EXISTS idx_sensor_mappings_device ON sensor_mappings(sensor_device_id);

-- テーブルに対する権限設定
ALTER TABLE sensor_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_logs ENABLE ROW LEVEL SECURITY;

-- 全ユーザーに対するポリシー
CREATE POLICY sensor_devices_all_users ON sensor_devices FOR ALL USING (true);
CREATE POLICY sensor_mappings_all_users ON sensor_mappings FOR ALL USING (true);
CREATE POLICY sensor_logs_all_users ON sensor_logs FOR ALL USING (true); 
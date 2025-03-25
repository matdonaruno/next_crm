-- 機器マスターテーブル
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  facility_id UUID NOT NULL REFERENCES facilities(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 機器点検項目テーブル
CREATE TABLE IF NOT EXISTS equipment_check_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'as_needed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 機器点検実施記録テーブル
CREATE TABLE IF NOT EXISTS equipment_maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_item_id UUID NOT NULL REFERENCES equipment_check_items(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  performed_by UUID NOT NULL REFERENCES profiles(id),
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  result BOOLEAN NOT NULL,  -- true: OK, false: NG
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_equipment_facility ON equipment(facility_id);
CREATE INDEX IF NOT EXISTS idx_equipment_department ON equipment(department_id);
CREATE INDEX IF NOT EXISTS idx_equipment_check_items_equipment ON equipment_check_items(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_records_check_item ON equipment_maintenance_records(check_item_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_records_equipment ON equipment_maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_records_performed_by ON equipment_maintenance_records(performed_by);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_records_performed_at ON equipment_maintenance_records(performed_at);

-- RLS(Row Level Security)ポリシー
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance_records ENABLE ROW LEVEL SECURITY;

-- 同じ施設のユーザーのみ参照・更新可能
CREATE POLICY equipment_same_facility ON equipment
    USING (facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid()));

-- 機器に対するポリシーを継承
CREATE POLICY equipment_check_items_inheritance ON equipment_check_items
    USING (equipment_id IN (SELECT id FROM equipment WHERE facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid())));

-- 点検実施記録のポリシー
CREATE POLICY equipment_maintenance_records_inheritance ON equipment_maintenance_records
    USING (equipment_id IN (SELECT id FROM equipment WHERE facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid()))); 
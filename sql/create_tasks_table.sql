-- タスクテーブルの作成
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  department_id UUID REFERENCES departments(id),
  facility_id UUID REFERENCES facilities(id) NOT NULL,
  assigned_to UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  
  CONSTRAINT fk_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_facility FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  CONSTRAINT fk_assigned_to FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- 更新時に updated_at を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 行レベルセキュリティの有効化
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ポリシーの作成
-- 閲覧ポリシー: ユーザーは自分の施設のタスクのみ閲覧可能
CREATE POLICY tasks_select_policy ON tasks
FOR SELECT
USING (
  facility_id IN (
    SELECT facility_id FROM profiles
    WHERE id = auth.uid()
  )
);

-- 挿入ポリシー: ユーザーは自分の施設のタスクのみ作成可能
CREATE POLICY tasks_insert_policy ON tasks
FOR INSERT
WITH CHECK (
  facility_id IN (
    SELECT facility_id FROM profiles
    WHERE id = auth.uid()
  )
);

-- 更新ポリシー: ユーザーは自分の施設のタスクのみ更新可能
CREATE POLICY tasks_update_policy ON tasks
FOR UPDATE
USING (
  facility_id IN (
    SELECT facility_id FROM profiles
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  facility_id IN (
    SELECT facility_id FROM profiles
    WHERE id = auth.uid()
  )
);

-- 削除ポリシー: ユーザーは自分の施設のタスクのみ削除可能
CREATE POLICY tasks_delete_policy ON tasks
FOR DELETE
USING (
  facility_id IN (
    SELECT facility_id FROM profiles
    WHERE id = auth.uid()
  )
);

-- インデックスの作成
CREATE INDEX idx_tasks_facility_id ON tasks(facility_id);
CREATE INDEX idx_tasks_department_id ON tasks(department_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status); 
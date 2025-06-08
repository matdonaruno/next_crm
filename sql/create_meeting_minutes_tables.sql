-- 会議議事録管理のテーブル作成

-- pg_trgm拡張機能を有効化（日本語テキスト検索のため）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 会議種類マスターテーブル
CREATE TABLE IF NOT EXISTS meeting_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  facility_id UUID REFERENCES facilities(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 会議議事録テーブル
CREATE TABLE IF NOT EXISTS meeting_minutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_type_id UUID REFERENCES meeting_types(id),
  title TEXT NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  recorded_by UUID REFERENCES profiles(id),
  facility_id UUID REFERENCES facilities(id),
  department_id UUID REFERENCES departments(id),
  attendees TEXT[], -- 参加者リスト
  content TEXT, -- 記録内容（全文）
  summary TEXT, -- AI生成された要約
  audio_file_path TEXT, -- 録音ファイルのパス（オプション）
  is_transcribed BOOLEAN DEFAULT FALSE, -- 文字起こし済みフラグ
  keywords TEXT[], -- AIで抽出されたキーワード
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 基本インデックス作成
CREATE INDEX IF NOT EXISTS idx_meeting_types_facility ON meeting_types(facility_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_type ON meeting_minutes(meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_facility ON meeting_minutes(facility_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_department ON meeting_minutes(department_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_recorded_by ON meeting_minutes(recorded_by);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_date ON meeting_minutes(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_keywords ON meeting_minutes USING GIN(keywords);

-- 日本語テキスト検索用のトリグラムインデックス
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_content_trgm ON meeting_minutes USING GIN(content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_title_trgm ON meeting_minutes USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_summary_trgm ON meeting_minutes USING GIN(summary gin_trgm_ops);

-- RLS(Row Level Security)ポリシー
ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

-- 同じ施設のユーザーのみアクセス可能
CREATE POLICY view_meeting_types ON meeting_types
  FOR SELECT USING (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY view_meeting_minutes ON meeting_minutes
  FOR SELECT USING (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 同じ施設のユーザーのみ追加・更新可能
CREATE POLICY insert_meeting_types ON meeting_types
  FOR INSERT WITH CHECK (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY update_meeting_types ON meeting_types
  FOR UPDATE USING (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY insert_meeting_minutes ON meeting_minutes
  FOR INSERT WITH CHECK (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY update_meeting_minutes ON meeting_minutes
  FOR UPDATE USING (
    facility_id IN (
      SELECT facility_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 会議種類サンプルデータ
INSERT INTO meeting_types (name, description, facility_id) 
SELECT
  name,
  description,
  facility_id
FROM (
  VALUES
    ('検査室内会議', '部門内での定例会議', NULL),
    ('朝礼', '朝の業務確認会議', NULL),
    ('スタッフミーティング', 'スタッフでの情報共有会議', NULL),
    ('委員会会議', '院内委員会での会議', NULL),
    ('役職会議', '主任や技師長会議', NULL),
    ('研修会', '研修や勉強会', NULL)
) AS data(name, description, facility_id)
CROSS JOIN (
  SELECT id FROM facilities LIMIT 1
) AS f(facility_id)
ON CONFLICT DO NOTHING; 
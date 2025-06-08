ALTER TABLE meeting_minutes
  ADD COLUMN IF NOT EXISTS transcript text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname = 'processing_enum'
  ) THEN
    CREATE TYPE processing_enum AS ENUM (
      'queued',
      'processing',
      'done',
      'error'
    );
  END IF;
END
$$;

UPDATE meeting_minutes
SET processing_status = 'queued'
WHERE processing_status IS NULL
   OR processing_status NOT IN ('queued','processing','done','error');

ALTER TABLE meeting_minutes
  ALTER COLUMN processing_status DROP DEFAULT;

ALTER TABLE meeting_minutes
  ALTER COLUMN processing_status
    TYPE processing_enum
    USING processing_status::processing_enum;

ALTER TABLE meeting_minutes
  ALTER COLUMN processing_status
    SET DEFAULT 'queued';

ALTER TABLE meeting_minutes
  ENABLE ROW LEVEL SECURITY;

-- 自施設のレコードだけ SELECT 可能
CREATE POLICY "own facility read"
  ON meeting_minutes
  FOR SELECT
  USING (
    facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid())
  );

-- 自施設のレコードだけ INSERT／UPDATE 可能
CREATE POLICY "own facility insert"
  ON meeting_minutes
  FOR INSERT WITH CHECK (
    facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "own facility update"
  ON meeting_minutes
  FOR UPDATE
  USING (
    facility_id = (SELECT facility_id FROM profiles WHERE id = auth.uid())
  );

ALTER TABLE storage.objects
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own facility storage"
  ON storage.objects
  FOR ALL
  USING (
    (metadata->>'facility_id')::uuid
      = (SELECT facility_id FROM profiles WHERE id = auth.uid())
  );

-- Fix the note column index without Japanese text search
-- Drop the failed index if it was partially created
DROP INDEX IF EXISTS idx_temperature_records_note;

-- Create a simple B-tree index for note column
CREATE INDEX IF NOT EXISTS idx_temperature_records_note ON temperature_records(note);

-- Verify the column was added correctly
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'temperature_records' 
AND column_name = 'note';
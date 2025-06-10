-- Add note column to temperature_records table
ALTER TABLE temperature_records ADD COLUMN note TEXT;

-- Create index for better performance if needed
CREATE INDEX IF NOT EXISTS idx_temperature_records_note ON temperature_records USING gin(to_tsvector('japanese', note));
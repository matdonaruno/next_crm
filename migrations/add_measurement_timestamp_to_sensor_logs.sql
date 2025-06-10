-- Migration: Add measurement_timestamp column to sensor_logs table
-- Execute this SQL in your Supabase SQL editor

-- Step 1: Check if column already exists (informational query)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'sensor_logs' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 2: Add measurement_timestamp column
ALTER TABLE sensor_logs ADD COLUMN IF NOT EXISTS measurement_timestamp TIMESTAMPTZ;

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sensor_logs_measurement_timestamp 
ON sensor_logs(measurement_timestamp);

CREATE INDEX IF NOT EXISTS idx_sensor_logs_device_measurement 
ON sensor_logs(sensor_device_id, measurement_timestamp);

-- Step 4: Update existing records to populate the new column
-- Use recorded_at as the initial value for measurement_timestamp
UPDATE sensor_logs 
SET measurement_timestamp = recorded_at::timestamptz 
WHERE measurement_timestamp IS NULL AND recorded_at IS NOT NULL;

-- For records without recorded_at, use a default timestamp
UPDATE sensor_logs 
SET measurement_timestamp = CURRENT_TIMESTAMP 
WHERE measurement_timestamp IS NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN sensor_logs.measurement_timestamp IS 'Timestamp when the sensor measurement was actually taken (may differ from recorded_at which is when it was logged to the system)';

-- Step 6: Verification queries
SELECT 
  COUNT(*) as total_records,
  COUNT(measurement_timestamp) as records_with_measurement_timestamp,
  COUNT(recorded_at) as records_with_recorded_at,
  MIN(measurement_timestamp) as earliest_measurement,
  MAX(measurement_timestamp) as latest_measurement
FROM sensor_logs;

-- Show updated table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'sensor_logs' 
AND table_schema = 'public'
ORDER BY ordinal_position;
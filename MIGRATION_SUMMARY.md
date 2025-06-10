# Sensor Logs Migration Summary

## Goal
Add `measurement_timestamp` TIMESTAMPTZ column to the `sensor_logs` table to track when sensor measurements were actually taken (distinct from when they were logged to the system).

## Current State
- ✅ Table: `sensor_logs` exists
- ✅ Current columns: `id`, `sensor_device_id`, `raw_data`, `recorded_at`, `ip_address`, `device_id`, `is_processed`
- ✅ Total records: 660
- ✅ All records have `recorded_at` values
- ❌ `measurement_timestamp` column does not exist yet

## Migration Steps

### 1. Execute SQL Migration
Copy and run this SQL in your **Supabase SQL Editor**:

```sql
-- Sensor Logs Migration: Add measurement_timestamp column
BEGIN;

-- Step 1: Add the measurement_timestamp column
ALTER TABLE sensor_logs ADD COLUMN measurement_timestamp TIMESTAMPTZ;

-- Step 2: Create performance indexes
CREATE INDEX idx_sensor_logs_measurement_timestamp 
ON sensor_logs(measurement_timestamp);

CREATE INDEX idx_sensor_logs_device_measurement 
ON sensor_logs(sensor_device_id, measurement_timestamp);

-- Step 3: Update existing records
UPDATE sensor_logs 
SET measurement_timestamp = recorded_at::timestamptz 
WHERE measurement_timestamp IS NULL AND recorded_at IS NOT NULL;

UPDATE sensor_logs 
SET measurement_timestamp = CURRENT_TIMESTAMP 
WHERE measurement_timestamp IS NULL;

-- Step 4: Add documentation
COMMENT ON COLUMN sensor_logs.measurement_timestamp IS 
'Timestamp when the sensor measurement was actually taken (may differ from recorded_at which is when it was logged to the system)';

COMMIT;
```

### 2. Verify Migration
Run the verification script:
```bash
node sensor_migration_complete.js --verify
```

## Expected Results
- All 660 existing records will have `measurement_timestamp` populated with their `recorded_at` values
- New indexes will improve query performance for time-based filtering
- Future INSERT statements should include `measurement_timestamp`

## Files Created
- `sensor_migration_complete.js` - Main migration tool with status check and verification
- `add_measurement_timestamp.sql` - Raw SQL migration file
- `manual_migration_steps.md` - Step-by-step manual instructions
- `create_migration_function.sql` - Database function approach (optional)
- Various supporting scripts for testing and verification

## Why Manual SQL Execution is Required
- Supabase REST API doesn't support DDL operations (ALTER TABLE, CREATE INDEX, etc.)
- Schema changes must be executed through Supabase Dashboard SQL Editor or CLI
- Our scripts provide verification and status checking but cannot execute DDL directly

## Post-Migration Code Changes
After migration, update your application code to use `measurement_timestamp`:

```typescript
// When inserting new sensor logs
const { error } = await supabase
  .from('sensor_logs')
  .insert({
    sensor_device_id: deviceId,
    raw_data: sensorData,
    recorded_at: new Date().toISOString(),
    measurement_timestamp: sensorData.timestamp, // Use actual sensor timestamp
    // ... other fields
  });

// When querying by measurement time
const { data } = await supabase
  .from('sensor_logs')
  .select('*')
  .gte('measurement_timestamp', startTime)
  .lte('measurement_timestamp', endTime)
  .order('measurement_timestamp', { ascending: false });
```
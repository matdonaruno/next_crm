// Simple migration runner using direct SQL execution
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...\n');
  
  try {
    // Try to select measurement_timestamp to see if it exists
    const { data, error } = await supabase
      .from('sensor_logs')
      .select('id, measurement_timestamp')
      .limit(1);
    
    if (error && error.message.includes('measurement_timestamp')) {
      console.log('❌ measurement_timestamp column does not exist yet');
      console.log('\n🛠️  Please execute the following SQL in Supabase SQL Editor:');
      console.log('================================================================================');
      console.log(`
-- Step 1: Add measurement_timestamp column
ALTER TABLE sensor_logs ADD COLUMN measurement_timestamp TIMESTAMPTZ;

-- Step 2: Create indexes
CREATE INDEX idx_sensor_logs_measurement_timestamp ON sensor_logs(measurement_timestamp);
CREATE INDEX idx_sensor_logs_device_measurement ON sensor_logs(sensor_device_id, measurement_timestamp DESC);

-- Step 3: Update existing records
UPDATE sensor_logs 
SET measurement_timestamp = to_timestamp((raw_data->>'timestamp')::bigint)
WHERE raw_data->>'timestamp' IS NOT NULL 
  AND raw_data->>'timestamp' != '';

UPDATE sensor_logs 
SET measurement_timestamp = recorded_at
WHERE measurement_timestamp IS NULL;

-- Step 4: Add comments
COMMENT ON COLUMN sensor_logs.measurement_timestamp IS 'Actual sensor measurement time (JST) from ESP8266 device';
COMMENT ON COLUMN sensor_logs.recorded_at IS 'Server data reception time (JST)';
      `);
      console.log('================================================================================');
      return false;
    } else if (error) {
      throw error;
    } else {
      console.log('✅ measurement_timestamp column already exists!');
      await verifyMigration();
      return true;
    }
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    return false;
  }
}

async function verifyMigration() {
  try {
    // Count total records and those with measurement_timestamp
    const { count: totalCount, error: totalError } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true });
    
    const { count: measurementCount, error: measurementError } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true })
      .not('measurement_timestamp', 'is', null);
    
    if (totalError || measurementError) {
      throw new Error('Count query failed');
    }
    
    console.log('\n📊 Migration Verification:');
    console.log(`   Total records: ${totalCount}`);
    console.log(`   Records with measurement_timestamp: ${measurementCount}`);
    
    if (totalCount === measurementCount) {
      console.log('✅ All records have measurement_timestamp populated!');
    } else {
      console.log(`❗ ${totalCount - measurementCount} records missing measurement_timestamp`);
    }
    
    // Show sample data
    const { data: sampleData, error: sampleError } = await supabase
      .from('sensor_logs')
      .select('recorded_at, measurement_timestamp, raw_data')
      .not('measurement_timestamp', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(3);
    
    if (!sampleError && sampleData && sampleData.length > 0) {
      console.log('\n📋 Sample migrated data:');
      sampleData.forEach((record, index) => {
        console.log(`   ${index + 1}. Recorded: ${record.recorded_at}`);
        console.log(`      Measured: ${record.measurement_timestamp}`);
        console.log(`      Has timestamp in raw_data: ${!!record.raw_data?.timestamp}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the check
checkMigrationStatus();
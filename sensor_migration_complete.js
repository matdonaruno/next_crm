#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkMigrationStatus() {
  console.log('🔍 Checking current migration status...\n');
  
  try {
    // Check if column exists
    const { error } = await supabase
      .from('sensor_logs')
      .select('measurement_timestamp')
      .limit(1);
    
    if (!error) {
      console.log('✅ measurement_timestamp column already exists!');
      
      // Get summary
      const { count: totalCount } = await supabase
        .from('sensor_logs')
        .select('*', { count: 'exact', head: true });
      
      const { count: timestampCount } = await supabase
        .from('sensor_logs')
        .select('*', { count: 'exact', head: true })
        .not('measurement_timestamp', 'is', null);
      
      console.log(`📊 Current state:`);
      console.log(`   Total records: ${totalCount}`);
      console.log(`   Records with measurement_timestamp: ${timestampCount}`);
      
      if (totalCount === timestampCount) {
        console.log('🎉 Migration is complete and all records have measurement_timestamp!');
      } else {
        console.log('⚠️  Some records are missing measurement_timestamp values.');
      }
      
      return true; // Already migrated
    }
    
    // Column doesn't exist
    console.log('📋 measurement_timestamp column does not exist yet.');
    
    // Show current state
    const { count: totalCount } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true });
    
    const { count: recordedAtCount } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true })
      .not('recorded_at', 'is', null);
    
    console.log(`📊 Current table state:`);
    console.log(`   Total records: ${totalCount}`);
    console.log(`   Records with recorded_at: ${recordedAtCount}`);
    
    return false; // Needs migration
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    return false;
  }
}

function showMigrationInstructions() {
  console.log('\n' + '='.repeat(80));
  console.log('🛠️  SENSOR LOGS MIGRATION INSTRUCTIONS');
  console.log('='.repeat(80));
  
  console.log('\n📋 STEP 1: Open your Supabase SQL Editor');
  console.log('   Go to: https://supabase.com/dashboard/project/[your-project]/sql');
  
  console.log('\n📋 STEP 2: Copy and execute the following SQL:');
  console.log('\n' + '-'.repeat(60));
  
  const migrationSQL = `-- Sensor Logs Migration: Add measurement_timestamp column
-- Execute this SQL in Supabase SQL Editor

BEGIN;

-- Step 1: Add the measurement_timestamp column
ALTER TABLE sensor_logs ADD COLUMN measurement_timestamp TIMESTAMPTZ;

-- Step 2: Create performance indexes
CREATE INDEX idx_sensor_logs_measurement_timestamp 
ON sensor_logs(measurement_timestamp);

CREATE INDEX idx_sensor_logs_device_measurement 
ON sensor_logs(sensor_device_id, measurement_timestamp);

-- Step 3: Update existing records
-- Use recorded_at as initial value for measurement_timestamp
UPDATE sensor_logs 
SET measurement_timestamp = recorded_at::timestamptz 
WHERE measurement_timestamp IS NULL AND recorded_at IS NOT NULL;

-- For any remaining records without recorded_at, use current timestamp
UPDATE sensor_logs 
SET measurement_timestamp = CURRENT_TIMESTAMP 
WHERE measurement_timestamp IS NULL;

-- Step 4: Add documentation
COMMENT ON COLUMN sensor_logs.measurement_timestamp IS 
'Timestamp when the sensor measurement was actually taken (may differ from recorded_at which is when it was logged to the system)';

COMMIT;

-- Step 5: Verification query
SELECT 
  COUNT(*) as total_records,
  COUNT(measurement_timestamp) as records_with_measurement_timestamp,
  COUNT(recorded_at) as records_with_recorded_at,
  MIN(measurement_timestamp) as earliest_measurement,
  MAX(measurement_timestamp) as latest_measurement
FROM sensor_logs;`;
  
  console.log(migrationSQL);
  console.log('-'.repeat(60));
  
  console.log('\n📋 STEP 3: After executing the SQL, run this script again to verify:');
  console.log('   node sensor_migration_complete.js --verify');
  
  console.log('\n💡 Tips:');
  console.log('   • The BEGIN/COMMIT block ensures atomicity');
  console.log('   • All existing records will get measurement_timestamp values');
  console.log('   • New indexes will improve query performance');
  console.log('   • Run verification to confirm success');
  
  console.log('\n' + '='.repeat(80));
}

async function showDetailedVerification() {
  console.log('\n🔍 Detailed Migration Verification\n');
  
  try {
    // Check column exists
    const { data: sampleData, error } = await supabase
      .from('sensor_logs')
      .select('id, recorded_at, measurement_timestamp')
      .order('recorded_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.log('❌ measurement_timestamp column does not exist yet.');
      console.log('Please run the migration SQL first.');
      return false;
    }
    
    console.log('✅ Column exists! Recent records:');
    sampleData?.forEach((record, index) => {
      console.log(`   ${index + 1}. ID: ${record.id}`);
      console.log(`      recorded_at: ${record.recorded_at}`);
      console.log(`      measurement_timestamp: ${record.measurement_timestamp}`);
      console.log('');
    });
    
    // Get comprehensive stats
    const { count: totalCount } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true });
    
    const { count: timestampCount } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true })
      .not('measurement_timestamp', 'is', null);
    
    const { count: recordedAtCount } = await supabase
      .from('sensor_logs')
      .select('*', { count: 'exact', head: true })
      .not('recorded_at', 'is', null);
    
    // Get time range
    const { data: timeRange } = await supabase
      .from('sensor_logs')
      .select('measurement_timestamp')
      .not('measurement_timestamp', 'is', null)
      .order('measurement_timestamp', { ascending: true })
      .limit(1);
    
    const { data: latestTime } = await supabase
      .from('sensor_logs')
      .select('measurement_timestamp')
      .not('measurement_timestamp', 'is', null)
      .order('measurement_timestamp', { ascending: false })
      .limit(1);
    
    console.log('📊 Migration Statistics:');
    console.log(`   Total records: ${totalCount}`);
    console.log(`   Records with measurement_timestamp: ${timestampCount}`);
    console.log(`   Records with recorded_at: ${recordedAtCount}`);
    
    if (timeRange?.[0] && latestTime?.[0]) {
      console.log(`   Earliest measurement: ${timeRange[0].measurement_timestamp}`);
      console.log(`   Latest measurement: ${latestTime[0].measurement_timestamp}`);
    }
    
    console.log('\n🎯 Migration Status:');
    if (totalCount === timestampCount) {
      console.log('✅ PERFECT! All records have measurement_timestamp values.');
      console.log('🎉 Migration completed successfully!');
      return true;
    } else {
      console.log(`⚠️  ${totalCount - timestampCount} records are missing measurement_timestamp.`);
      console.log('Consider running an UPDATE query to fix missing values.');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Verification error:', error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🚀 Sensor Logs Migration Tool');
  console.log('Adding measurement_timestamp column to sensor_logs table\n');
  
  if (args.includes('--help')) {
    console.log('Usage:');
    console.log('  node sensor_migration_complete.js         # Check status and show instructions');
    console.log('  node sensor_migration_complete.js --verify # Detailed verification after migration');
    console.log('  node sensor_migration_complete.js --help   # Show this help');
    return;
  }
  
  if (args.includes('--verify')) {
    await showDetailedVerification();
    return;
  }
  
  // Main workflow
  const alreadyMigrated = await checkMigrationStatus();
  
  if (alreadyMigrated) {
    console.log('\n💡 Run with --verify for detailed verification.');
  } else {
    showMigrationInstructions();
  }
}

if (require.main === module) {
  main();
}
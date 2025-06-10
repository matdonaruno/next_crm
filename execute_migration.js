// execute_migration.js - Direct SQL migration execution
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE; // Service role key for admin operations

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  console.log('🚀 Executing sensor_logs migration...\n');
  
  try {
    // Step 1: Add the column
    console.log('📝 Step 1: Adding measurement_timestamp column...');
    const { error: alterError } = await supabase.rpc('execute_sql', {
      sql: 'ALTER TABLE sensor_logs ADD COLUMN measurement_timestamp TIMESTAMPTZ;'
    });
    
    if (alterError && !alterError.message.includes('already exists')) {
      throw alterError;
    }
    console.log('✅ Column added successfully');

    // Step 2: Create indexes
    console.log('📝 Step 2: Creating performance indexes...');
    const { error: indexError1 } = await supabase.rpc('execute_sql', {
      sql: 'CREATE INDEX IF NOT EXISTS idx_sensor_logs_measurement_timestamp ON sensor_logs(measurement_timestamp);'
    });
    
    const { error: indexError2 } = await supabase.rpc('execute_sql', {
      sql: 'CREATE INDEX IF NOT EXISTS idx_sensor_logs_device_measurement ON sensor_logs(sensor_device_id, measurement_timestamp);'
    });

    if (indexError1) throw indexError1;
    if (indexError2) throw indexError2;
    console.log('✅ Indexes created successfully');

    // Step 3: Update existing records
    console.log('📝 Step 3: Updating existing records...');
    const { error: updateError } = await supabase.rpc('execute_sql', {
      sql: `UPDATE sensor_logs 
            SET measurement_timestamp = recorded_at::timestamptz 
            WHERE measurement_timestamp IS NULL AND recorded_at IS NOT NULL;`
    });
    
    if (updateError) throw updateError;
    console.log('✅ Existing records updated');

    // Step 4: Handle any remaining NULL values
    console.log('📝 Step 4: Handling remaining NULL values...');
    const { error: nullError } = await supabase.rpc('execute_sql', {
      sql: `UPDATE sensor_logs 
            SET measurement_timestamp = CURRENT_TIMESTAMP 
            WHERE measurement_timestamp IS NULL;`
    });
    
    if (nullError) throw nullError;
    console.log('✅ NULL values handled');

    // Verification
    console.log('\n🔍 Verifying migration...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('sensor_logs')
      .select('id')
      .not('measurement_timestamp', 'is', null)
      .limit(1);

    if (verifyError) throw verifyError;
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Running final verification...');
    
    // Run verification script
    await runVerification();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n💡 You may need to run the SQL manually in Supabase dashboard');
    process.exit(1);
  }
}

async function runVerification() {
  try {
    const { data, error } = await supabase
      .from('sensor_logs')
      .select('*')
      .limit(1);
      
    if (error) throw error;
    
    if (data && data[0] && 'measurement_timestamp' in data[0]) {
      console.log('✅ measurement_timestamp column exists and accessible');
      
      // Count records
      const { count, error: countError } = await supabase
        .from('sensor_logs')
        .select('*', { count: 'exact', head: true });
        
      if (!countError) {
        console.log(`📊 Total records: ${count}`);
      }
      
    } else {
      console.log('❌ measurement_timestamp column not found');
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Execute if script is run directly
if (require.main === module) {
  executeMigration();
}

module.exports = { executeMigration, runVerification };
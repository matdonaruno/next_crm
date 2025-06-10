// Test sensor API endpoint
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSensorAPI() {
  console.log('🧪 Testing sensor API endpoint...');
  
  try {
    // Test payload similar to ESP8266
    const testPayload = {
      ahtTemp: 25.9,
      ahtHum: 58.8,
      bmpTemp: 26.7,
      bmpPres: 1006,
      batteryVolt: 3.3,
      deviceId: "BCFF4D0E8852BCFF4D0E8852",
      token: "xM11a2W3mp1l5oCJzyPbTtFCAbdd02r9",
      ipAddress: "192.168.0.16",
      timestamp: 1749501813
    };
    
    console.log('📡 Sending test payload:', JSON.stringify(testPayload, null, 2));
    
    // Call the sensor API endpoint
    const response = await fetch('http://localhost:3000/api/sensor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', response.headers);
    
    const responseText = await response.text();
    console.log('📊 Response body:', responseText);
    
    if (response.status === 500) {
      console.log('\n🔍 Investigating 500 error...');
      
      // Check if device exists
      const { data: deviceCheck, error: deviceError } = await supabase
        .from('sensor_devices')
        .select('*')
        .eq('device_id', testPayload.deviceId)
        .single();
      
      console.log('🔍 Device check:', { deviceCheck, deviceError });
      
      // Check recent logs
      const { data: recentLogs, error: logsError } = await supabase
        .from('sensor_logs')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(3);
      
      console.log('🔍 Recent logs:', { recentLogs, logsError });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/api/sensor', {
      method: 'GET'
    });
    console.log('✅ Server is running on port 3000');
    return true;
  } catch (error) {
    console.log('❌ Server not running on port 3000');
    console.log('💡 Please start the dev server with: npm run dev');
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testSensorAPI();
  }
}

main();
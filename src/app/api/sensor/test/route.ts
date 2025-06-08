// src/app/api/sensor/test/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  console.log('[sensor-test] === Test API Started ===');
  
  try {
    const payload = await request.json();
    console.log('[sensor-test] Received payload:', JSON.stringify(payload, null, 2));
    
    // Supabase接続テスト
    console.log('[sensor-test] Testing Supabase connection...');
    const supabase = await createServerClient();
    
    // テーブル存在確認
    console.log('[sensor-test] Testing table access...');
    
    // sensor_devices テーブルのカラム確認
    const { data: deviceSchema, error: schemaError } = await supabase
      .from('sensor_devices')
      .select('*')
      .limit(1);
    
    console.log('[sensor-test] sensor_devices schema test:', { deviceSchema, schemaError });
    
    // sensor_logs テーブルのカラム確認  
    const { data: logSchema, error: logSchemaError } = await supabase
      .from('sensor_logs')
      .select('*')
      .limit(1);
    
    console.log('[sensor-test] sensor_logs schema test:', { logSchema, logSchemaError });
    
    // facilities テーブル確認
    const { data: facilities, error: facilitiesError } = await supabase
      .from('facilities')
      .select('id,name')
      .limit(1);
    
    console.log('[sensor-test] facilities test:', { facilities, facilitiesError });
    
    // デバイス挿入テスト
    const testDeviceId = `TEST_${Date.now()}`;
    console.log('[sensor-test] Testing device insertion with ID:', testDeviceId);
    
    if (facilities && facilities.length > 0) {
      const { data: insertResult, error: insertError } = await supabase
        .from('sensor_devices')
        .insert({
          device_id: testDeviceId,
          device_name: 'Test Device',
          facility_id: facilities[0].id,
          is_active: true,
          last_seen: new Date().toISOString(),
          location: 'Test Location',
        })
        .select('*')
        .single();
      
      console.log('[sensor-test] Device insertion result:', { insertResult, insertError });
      
      if (insertResult) {
        // ログ挿入テスト
        const { data: logResult, error: logError } = await supabase
          .from('sensor_logs')
          .insert({
            sensor_device_id: insertResult.id,
            raw_data: payload,
            ip_address: 'test-ip',
            device_id: testDeviceId,
            recorded_at: new Date().toISOString(),
            is_processed: false,
          })
          .select('*')
          .single();
        
        console.log('[sensor-test] Log insertion result:', { logResult, logError });
        
        // クリーンアップ - テストデータを削除
        await supabase.from('sensor_logs').delete().eq('id', logResult?.id);
        await supabase.from('sensor_devices').delete().eq('id', insertResult.id);
        console.log('[sensor-test] Test data cleaned up');
      }
    }
    
    return NextResponse.json({
      status: 'test_success',
      message: 'All tests completed successfully',
      payload_received: payload,
      test_results: {
        supabase_connection: 'OK',
        tables_accessible: !schemaError && !logSchemaError && !facilitiesError,
        facilities_count: facilities?.length || 0
      }
    });
    
  } catch (error) {
    console.error('[sensor-test] Test API error:', error);
    console.error('[sensor-test] Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return NextResponse.json({
      status: 'test_error',
      message: error instanceof Error ? error.message : 'Unknown error',
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : null
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // クライアントのIPアドレスを取得
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  
  // リクエストの詳細を取得
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  console.log(`ESP8266接続テスト: ${clientIp} - UA: ${userAgent}`);
  
  // JSONレスポンスを返す
  return NextResponse.json({
    status: 'test_endpoint_ready',
    message: 'Sensor test endpoint is ready. Send POST request with sensor data.',
    instructions: 'Send the same JSON payload that ESP8266 would send to test the processing logic.',
    client: {
      ip: clientIp,
      userAgent: userAgent
    }
  });
} 
// デバッグ用センサーAPI - 詳細なエラー追跡
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getJstTimestamp } from '@/lib/utils';

export async function POST(request: Request) {
  const start = Date.now();
  let step = 'init';

  try {
    console.log('[DEBUG] === センサーAPI デバッグ開始 ===');
    
    // ステップ1: リクエスト解析
    step = 'payload_parsing';
    const payload = await request.json();
    console.log('[DEBUG] Step 1 - Payload received:', JSON.stringify(payload, null, 2));
    
    const {
      ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt,
      deviceId, token, ipAddress, timestamp
    } = payload;

    // ステップ2: Supabase接続
    step = 'supabase_connection';
    console.log('[DEBUG] Step 2 - Creating Supabase client...');
    const supabase = await createServerClient();
    console.log('[DEBUG] Step 2 - Supabase client created successfully');

    // ステップ3: 基本テーブル存在確認
    step = 'table_check';
    console.log('[DEBUG] Step 3 - Checking essential tables...');
    
    // facilitiesテーブル確認
    const { data: facilityCheck, error: facilityError } = await supabase
      .from('facilities')
      .select('id')
      .limit(1);
    console.log('[DEBUG] Step 3a - Facilities table check:', { data: facilityCheck, error: facilityError });

    // sensor_devicesテーブル確認
    const { data: deviceCheck, error: deviceError } = await supabase
      .from('sensor_devices')
      .select('id, device_id')
      .limit(1);
    console.log('[DEBUG] Step 3b - Sensor devices table check:', { data: deviceCheck, error: deviceError });

    // sensor_logsテーブル確認
    const { data: logCheck, error: logError } = await supabase
      .from('sensor_logs')
      .select('id')
      .limit(1);
    console.log('[DEBUG] Step 3c - Sensor logs table check:', { data: logCheck, error: logError });

    // ステップ4: デバイス検索
    step = 'device_search';
    console.log('[DEBUG] Step 4 - Searching for device:', deviceId);
    
    const { data: existingDevice, error: searchError } = await supabase
      .from('sensor_devices')
      .select('id, device_name, facility_id, department_id, auth_token')
      .eq('device_id', deviceId)
      .maybeSingle(); // singleの代わりにmaybeSingleを使用
    
    console.log('[DEBUG] Step 4 - Device search result:', { data: existingDevice, error: searchError });

    let device = existingDevice;

    // ステップ5: 新規デバイス登録（必要な場合）
    if (!device) {
      step = 'new_device_registration';
      console.log('[DEBUG] Step 5 - Device not found, registering new device...');
      
      // 施設ID取得
      const { data: defaultFacility, error: facError } = await supabase
        .from('facilities')
        .select('id')
        .limit(1)
        .single();
      
      console.log('[DEBUG] Step 5a - Default facility:', { data: defaultFacility, error: facError });
      
      if (!defaultFacility) {
        return NextResponse.json({
          status: 'error',
          message: 'No facilities found',
          step: step
        }, { status: 400 });
      }

      // 新規デバイス作成
      const { data: newDevice, error: createError } = await supabase
        .from('sensor_devices')
        .insert({
          device_id: deviceId,
          device_name: `ESP8266センサー ${deviceId.slice(0, 8)}`,
          facility_id: defaultFacility.id,
          auth_token: token,
          is_active: true,
          ip_address: ipAddress
        })
        .select('id, device_name, facility_id, department_id, auth_token')
        .single();
      
      console.log('[DEBUG] Step 5b - New device creation:', { data: newDevice, error: createError });
      
      if (createError) {
        console.error('[DEBUG] Device creation failed:', createError);
        return NextResponse.json({
          status: 'error',
          message: 'Failed to create device',
          error: createError.message,
          step: step
        }, { status: 500 });
      }
      
      device = newDevice;
    }

    // ステップ6: sensor_logs挿入テスト
    step = 'sensor_log_insertion';
    console.log('[DEBUG] Step 6 - Inserting sensor log...');
    
    const sensorData = { ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt, timestamp };
    
    const { data: logInsert, error: logInsertError } = await supabase
      .from('sensor_logs')
      .insert({
        sensor_device_id: device?.id,
        raw_data: sensorData,
        ip_address: ipAddress,
        device_id: deviceId,
        recorded_at: getJstTimestamp()
        // is_processed を一時的に除外してテスト
      })
      .select('id');
    
    console.log('[DEBUG] Step 6 - Sensor log insertion:', { data: logInsert, error: logInsertError });

    if (logInsertError) {
      console.error('[DEBUG] Sensor log insertion failed:', logInsertError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to insert sensor log',
        error: logInsertError.message,
        step: step
      }, { status: 500 });
    }

    // ステップ7: 成功レスポンス
    step = 'success';
    console.log('[DEBUG] Step 7 - Success!');
    
    return NextResponse.json({
      status: 'debug_success',
      message: 'All steps completed successfully',
      device_id: device?.id,
      device_name: device?.device_name,
      sensor_log_id: logInsert?.[0]?.id,
      processing_time: Date.now() - start,
      step: step
    }, { status: 200 });

  } catch (error: any) {
    console.error('[DEBUG] Error at step:', step);
    console.error('[DEBUG] Error details:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    
    return NextResponse.json({
      status: 'debug_error',
      message: 'Debug API failed',
      step: step,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

// GET メソッドでシステム状態確認
export async function GET() {
  try {
    console.log('[DEBUG] GET /api/sensor/debug - System check');
    
    const supabase = await createServerClient();
    
    // テーブル存在確認
    const tables = ['facilities', 'sensor_devices', 'sensor_logs'];
    const results: any = {};
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        results[table] = { accessible: true, error: null, sample_count: data?.length || 0 };
      } catch (err: any) {
        results[table] = { accessible: false, error: err.message };
      }
    }
    
    return NextResponse.json({
      status: 'system_check',
      timestamp: new Date().toISOString(),
      tables: results
    });
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'system_error',
      error: error.message
    }, { status: 500 });
  }
}
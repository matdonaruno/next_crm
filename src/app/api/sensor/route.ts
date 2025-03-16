import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const { ahtTemp, ahtHum, bmpTemp, bmpPres, deviceId, ipAddress } = await request.json();
    const ip = request.headers.get('x-forwarded-for') || ipAddress || 'unknown';
    
    console.log(`受信センサーデータ: ${ip} - AHT温度: ${ahtTemp}℃, BMP温度: ${bmpTemp}℃`);
    
    // 1. IPアドレスからセンサーデバイスを特定
    const { data: deviceData, error: deviceError } = await supabase
      .from('sensor_devices')
      .select('id, facility_id, department_id')
      .eq('ip_address', ip)
      .single();
      
    if (deviceError || !deviceData) {
      console.log(`未登録デバイス(${ip})からのデータ: ${ahtTemp}℃, ${bmpTemp}℃`);
      
      // 未登録デバイスの場合はログだけ残す
      await supabase.from('sensor_logs').insert({
        raw_data: { ahtTemp, ahtHum, bmpTemp, bmpPres },
        ip_address: ip
      });
      
      return NextResponse.json({ 
        status: 'unregistered', 
        message: 'Device not registered' 
      }, { status: 200 });
    }
    
    // 2. センサーログを記録
    await supabase.from('sensor_logs').insert({
      sensor_device_id: deviceData.id,
      raw_data: { ahtTemp, ahtHum, bmpTemp, bmpPres },
      ip_address: ip
    });
    
    // 3. センサーデバイスの最終更新時間を更新
    await supabase
      .from('sensor_devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', deviceData.id);
    
    // 4. このデバイスに紐づいているマッピング情報を取得
    const { data: mappings, error: mappingError } = await supabase
      .from('sensor_mappings')
      .select('sensor_type, temperature_item_id, offset_value')
      .eq('sensor_device_id', deviceData.id);
      
    if (mappingError || !mappings.length) {
      console.log(`デバイス${deviceData.id}のマッピング情報が見つかりません`);
      return NextResponse.json({ 
        status: 'no_mapping', 
        message: 'No sensor mappings found' 
      }, { status: 200 });
    }
    
    // 5. 現在日付（YYYY-MM-DD形式）
    const recordDate = new Date().toISOString().split('T')[0];
    
    // 6. 既存レコードをチェック（同じ日に既に記録があるか）
    const { data: existingRecord, error: recordError } = await supabase
      .from('temperature_records')
      .select('id')
      .eq('facility_id', deviceData.facility_id)
      .eq('department_id', deviceData.department_id)
      .eq('record_date', recordDate)
      .single();
    
    let recordId;
    
    if (recordError || !existingRecord) {
      console.log(`新しい記録を作成: 施設ID ${deviceData.facility_id}, 部署ID ${deviceData.department_id}`);
      
      // 7. 新しいレコードを作成
      const { data: newRecord, error: insertError } = await supabase
        .from('temperature_records')
        .insert({
          facility_id: deviceData.facility_id,
          department_id: deviceData.department_id,
          record_date: recordDate,
          is_auto_recorded: true
        })
        .select('id')
        .single();
        
      if (insertError || !newRecord) {
        console.error('記録の作成に失敗:', insertError);
        return NextResponse.json({ 
          status: 'error', 
          message: 'Failed to create record' 
        }, { status: 500 });
      }
      
      recordId = newRecord.id;
    } else {
      recordId = existingRecord.id;
      console.log(`既存の記録を更新: ID ${recordId}`);
    }
    
    // 8. 各センサーデータをマッピングに従って保存
    for (const mapping of mappings) {
      let sensorValue;
      switch (mapping.sensor_type) {
        case 'ahtTemp': sensorValue = ahtTemp; break;
        case 'bmpTemp': sensorValue = bmpTemp; break;
        case 'ahtHum': sensorValue = ahtHum; break;
        case 'bmpPres': sensorValue = bmpPres; break;
        default: continue;
      }
      
      // オフセット値を適用
      sensorValue += mapping.offset_value || 0;
      
      // 既存の詳細レコードをチェック
      const { data: existingDetail, error: detailError } = await supabase
        .from('temperature_record_details')
        .select('id')
        .eq('temperature_record_id', recordId)
        .eq('temperature_item_id', mapping.temperature_item_id)
        .single();
        
      if (detailError || !existingDetail) {
        // 新しい詳細レコードを挿入
        await supabase
          .from('temperature_record_details')
          .insert({
            temperature_record_id: recordId,
            temperature_item_id: mapping.temperature_item_id,
            value: sensorValue,
            data_source: 'sensor'
          });
      } else {
        // 既存の詳細レコードを更新
        await supabase
          .from('temperature_record_details')
          .update({ 
            value: sensorValue,
            data_source: 'sensor'
          })
          .eq('id', existingDetail.id);
      }
    }
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Data recorded successfully' 
    });
    
  } catch (error) {
    console.error('Sensor API error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Internal server error' 
    }, { status: 500 });
  }
} 
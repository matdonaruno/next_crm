import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getJstTimestamp, getJstDateString } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const startTime = Date.now(); // 処理開始時間
    console.log(`センサーAPI: リクエスト受信 ${new Date().toISOString()}`);
    
    const { ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt, deviceId, ipAddress, timestamp } = await request.json();
    const ip = request.headers.get('x-forwarded-for') || ipAddress || 'unknown';
    
    console.log(`受信センサーデータ: ${ip} - AHT温度: ${ahtTemp}℃, BMP温度: ${bmpTemp}℃, バッテリー: ${batteryVolt}V, デバイスID: ${deviceId || 'なし'}`);
    
    // デバイスIDとIPアドレスの両方で検索（deviceIdを優先）
    let deviceData = null;
    
    // 1. デバイス検索を並列実行
    const [deviceByIdResult, deviceByIpResult] = await Promise.allSettled([
      // デバイスIDで検索
      deviceId ? supabase
        .from('sensor_devices')
        .select('id, facility_id, department_id')
        .eq('device_id', deviceId)
        .single() : Promise.resolve({ data: null }),
      
      // IPアドレスで検索（後方互換性）
      ip !== 'unknown' ? supabase
        .from('sensor_devices')
        .select('id, facility_id, department_id')
        .eq('ip_address', ip)
        .single() : Promise.resolve({ data: null })
    ]);
    
    // デバイスIDでの検索結果を優先
    if (deviceByIdResult.status === 'fulfilled' && deviceByIdResult.value.data) {
      deviceData = deviceByIdResult.value.data;
    } else if (deviceByIpResult.status === 'fulfilled' && deviceByIpResult.value.data) {
      deviceData = deviceByIpResult.value.data;
    }
      
    if (!deviceData) {
      console.log(`未登録デバイス(${deviceId || ip})からのデータ: ${ahtTemp}℃, ${bmpTemp}℃, バッテリー: ${batteryVolt}V`);
      
      // 未登録デバイスの場合はログだけ残す。batteryVoltを追加
      await supabase.from('sensor_logs').insert({
        raw_data: { ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt },
        ip_address: ip,
        device_id: deviceId || null,
        recorded_at: getJstTimestamp() // 日本時間のタイムスタンプを使用
      });
      
      const endTime = Date.now();
      console.log(`センサーAPI: 未登録デバイス処理完了 (${endTime - startTime}ms)`);
      
      return NextResponse.json({ 
        status: 'unregistered', 
        message: 'Device not registered',
        processingTime: endTime - startTime
      }, { status: 200 });
    }
    
    // 2. センサーログ記録と、デバイス更新を並列実行
    const updateData: any = { last_seen: getJstTimestamp() };
    if (ip !== 'unknown') updateData.ip_address = ip;
    if (deviceId) updateData.device_id = deviceId;
    
    const [logInsertResult, deviceUpdateResult, mappingsResult] = await Promise.all([
      // センサーログを記録。batteryVoltを追加
      supabase.from('sensor_logs').insert({
        sensor_device_id: deviceData.id,
        raw_data: { ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt },
        ip_address: ip,
        device_id: deviceId || null,
        recorded_at: getJstTimestamp()
      }),
      
      // センサーデバイスの最終更新時間を更新
      supabase
        .from('sensor_devices')
        .update(updateData)
        .eq('id', deviceData.id),
        
      // マッピング情報を取得
      supabase
        .from('sensor_mappings')
        .select('sensor_type, temperature_item_id, offset_value')
        .eq('sensor_device_id', deviceData.id)
    ]);
    
    // マッピング情報がなければ早期リターン
    if (mappingsResult.error || !mappingsResult.data || mappingsResult.data.length === 0) {
      console.log(`デバイス${deviceData.id}のマッピング情報が見つかりません`);
      
      const endTime = Date.now();
      console.log(`センサーAPI: マッピングなしで処理完了 (${endTime - startTime}ms)`);
      
      return NextResponse.json({ 
        status: 'no_mapping', 
        message: 'No sensor mappings found',
        processingTime: endTime - startTime
      }, { status: 200 });
    }
    
    const mappings = mappingsResult.data;
    
    // 5. 現在日付（YYYY-MM-DD形式）- 日本時間で取得
    const recordDate = getJstDateString();
    
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
        
        const endTime = Date.now();
        console.log(`センサーAPI: エラーで処理完了 (${endTime - startTime}ms)`);
        
        return NextResponse.json({ 
          status: 'error', 
          message: 'Failed to create record',
          processingTime: endTime - startTime
        }, { status: 500 });
      }
      
      recordId = newRecord.id;
    } else {
      recordId = existingRecord.id;
      console.log(`既存の記録を更新: ID ${recordId}`);
    }
    
    // 8. 各センサーデータの処理を並列実行
    const detailUpdates = mappings.map(mapping => {
      let sensorValue;
      switch (mapping.sensor_type) {
        case 'ahtTemp': sensorValue = ahtTemp; break;
        case 'bmpTemp': sensorValue = bmpTemp; break;
        case 'ahtHum': sensorValue = ahtHum; break;
        case 'bmpPres': sensorValue = bmpPres; break;
        case 'batteryVolt': sensorValue = batteryVolt; break; // バッテリー電圧のケースも追加
        default: return Promise.resolve(); // マッピングなしはスキップ
      }
      
      // オフセット値を適用
      if (sensorValue !== undefined && sensorValue !== null) {
        sensorValue += mapping.offset_value || 0;
      } else {
        return Promise.resolve(); // 値がなければスキップ
      }
      
      // 既存レコードをチェックして、新規追加か更新かを判断して処理
      return processDetailRecord(recordId, mapping.temperature_item_id, sensorValue);
    });
    
    // すべての詳細レコード処理を待機
    await Promise.all(detailUpdates.filter(Boolean));
    
    const endTime = Date.now();
    console.log(`センサーAPI: 処理完了 (${endTime - startTime}ms)`);
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'Data recorded successfully',
      processingTime: endTime - startTime
    });
    
  } catch (error) {
    console.error('Sensor API error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}

// 詳細レコード処理の補助関数
async function processDetailRecord(recordId: string, itemId: string, value: number) {
  try {
    // 既存の詳細レコードをチェック
    const { data: existingDetail, error: detailError } = await supabase
      .from('temperature_record_details')
      .select('id')
      .eq('temperature_record_id', recordId)
      .eq('temperature_item_id', itemId)
      .single();
      
    if (detailError || !existingDetail) {
      // 新しい詳細レコードを挿入
      return supabase
        .from('temperature_record_details')
        .insert({
          temperature_record_id: recordId,
          temperature_item_id: itemId,
          value: value,
          data_source: 'sensor'
        });
    } else {
      // 既存の詳細レコードを更新
      return supabase
        .from('temperature_record_details')
        .update({ 
          value: value,
          data_source: 'sensor'
        })
        .eq('id', existingDetail.id);
    }
  } catch (error) {
    console.error(`詳細レコード処理エラー(項目ID: ${itemId}):`, error);
    throw error;
  }
} 
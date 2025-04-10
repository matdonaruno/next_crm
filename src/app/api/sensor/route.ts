import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getJstTimestamp, getJstDateString } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const startTime = Date.now(); // 処理開始時間
    console.log(`センサーAPI: リクエスト受信 ${new Date().toISOString()}`);
    
    // リクエストデータを取得
    const requestData = await request.json();
    
    // 基本データ抽出（従来互換）+ 拡張フィールド
    const { 
      // 従来のフィールド
      ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt, deviceId, ipAddress, timestamp,
      // 拡張フィールド 
      device_id, device_name, mac_address, data 
    } = requestData;
    
    // 優先順位: device_id > deviceId
    const effectiveDeviceId = device_id || deviceId || null;
    
    // センサーデータ形式の正規化（2つのフォーマットに対応）
    const sensorData = data || { 
      ahtTemp, ahtHum, bmpTemp, bmpPres, batteryVolt 
    };
    
    // IPアドレスの取得（ヘッダー > リクエスト > デフォルト）
    const ip = request.headers.get('x-forwarded-for') || ipAddress || 'unknown';
    
    console.log(`受信センサーデータ: ${ip} - デバイスID: ${effectiveDeviceId || 'なし'}`);
    console.log('センサー値:', sensorData);
    
    // デバイスIDとIPアドレスの両方で検索（デバイスIDを優先）
    let deviceData = null;
    let isNewDevice = false;
    
    // 1. デバイス検索を並列実行
    const [deviceByIdResult, deviceByIpResult] = await Promise.allSettled([
      // デバイスIDで検索
      effectiveDeviceId ? supabase
        .from('sensor_devices')
        .select('id, device_name, facility_id, department_id, location')
        .eq('device_id', effectiveDeviceId)
        .single() : Promise.resolve({ data: null }),
      
      // IPアドレスで検索（後方互換性）
      ip !== 'unknown' ? supabase
        .from('sensor_devices')
        .select('id, device_name, facility_id, department_id, location')
        .eq('ip_address', ip)
        .single() : Promise.resolve({ data: null })
    ]);
    
    // デバイスIDでの検索結果を優先
    if (deviceByIdResult.status === 'fulfilled' && deviceByIdResult.value.data) {
      deviceData = deviceByIdResult.value.data;
    } else if (deviceByIpResult.status === 'fulfilled' && deviceByIpResult.value.data) {
      deviceData = deviceByIpResult.value.data;
    }
    
    // デバイスが存在しない場合は自動登録
    if (!deviceData && effectiveDeviceId) {
      console.log(`未登録デバイス(${effectiveDeviceId})を自動登録します`);
      
      // デフォルト施設を取得（最初の施設を使用）
      const { data: defaultFacility, error: facilityError } = await supabase
        .from('facilities')
        .select('id')
        .limit(1)
        .single();
        
      if (facilityError) {
        console.error('デフォルト施設取得エラー:', facilityError);
        
        // センサーログだけは記録する
        await supabase.from('sensor_logs').insert({
          raw_data: sensorData,
          ip_address: ip,
          device_id: effectiveDeviceId || null,
          recorded_at: getJstTimestamp()
        });
        
        return NextResponse.json({ 
          status: 'error', 
          message: 'デフォルト施設が設定されていません。先に施設を登録してください。',
          sensorLogSaved: true
        }, { status: 200 });
      }
      
      // 新規デバイスを登録
      const { data: newDevice, error: newDeviceError } = await supabase
        .from('sensor_devices')
        .insert({
          device_id: effectiveDeviceId,
          device_name: device_name || `新規センサー ${effectiveDeviceId.substring(0, 8)}`, // 指定がなければ自動生成
          mac_address: mac_address || null,
          ip_address: ip !== 'unknown' ? ip : null,
          facility_id: defaultFacility.id,
          department_id: null, // デフォルトは未割り当て
          is_active: true,
          last_seen: getJstTimestamp(),
          location: '未設定',
          note: '自動登録されたセンサーデバイスです。部門割り当てを行ってください。'
        })
        .select('id, device_name, facility_id, department_id, location')
        .single();
      
      if (newDeviceError) {
        console.error('デバイス自動登録エラー:', newDeviceError);
        
        // センサーログだけは記録する
        await supabase.from('sensor_logs').insert({
          raw_data: sensorData,
          ip_address: ip,
          device_id: effectiveDeviceId || null,
          recorded_at: getJstTimestamp()
        });
        
        return NextResponse.json({ 
          status: 'error', 
          message: 'デバイスの自動登録に失敗しました',
          sensorLogSaved: true
        }, { status: 200 });
      }
      
      deviceData = newDevice;
      isNewDevice = true;
      console.log(`デバイス ${effectiveDeviceId} を自動登録しました。ID: ${deviceData.id}`);
    }
    
    // 2. センサーログに保存
    const { data: sensorLog, error: logError } = await supabase
      .from('sensor_logs')
      .insert({
        sensor_device_id: deviceData?.id || null,
        raw_data: sensorData,
        ip_address: ip,
        device_id: effectiveDeviceId || null,
        recorded_at: getJstTimestamp(),
        is_processed: deviceData?.department_id ? true : false // 部門割り当てがあれば処理済みとマーク
      })
      .select('id')
      .single();
    
    if (logError) {
      console.error('センサーログ保存エラー:', logError);
      return NextResponse.json({ 
        status: 'error', 
        message: 'センサーログの保存に失敗しました' 
      }, { status: 500 });
    }
    
    // デバイスが登録されていないか、部門割り当てがない場合
    if (!deviceData || !deviceData.department_id) {
      const message = !deviceData 
        ? '未登録デバイスからのデータです' 
        : 'デバイスに部門が割り当てられていません';
      
      console.log(`温度記録変換スキップ: ${message}`);
      
      const endTime = Date.now();
      return NextResponse.json({ 
        status: 'log_only', 
        message,
        device_status: deviceData ? 'unassigned' : 'unregistered',
        is_new_device: isNewDevice,
        sensor_log_id: sensorLog.id,
        processingTime: endTime - startTime
      }, { status: 200 });
    }
    
    // 3. デバイス情報の更新
    const updateData: any = { last_seen: getJstTimestamp() };
    if (ip !== 'unknown') updateData.ip_address = ip;
    
    await supabase
      .from('sensor_devices')
      .update(updateData)
      .eq('id', deviceData.id);
    
    // 4. マッピング情報を取得
    const { data: mappings, error: mappingError } = await supabase
      .from('sensor_mappings')
      .select('sensor_type, temperature_item_id, offset_value')
      .eq('sensor_device_id', deviceData.id);
    
    // 5. マッピングがない場合は自動マッピングを試みる
    if (mappingError || !mappings || mappings.length === 0) {
      console.log(`デバイス ${deviceData.id} のマッピングが見つかりません。自動マッピングを試みます。`);
      
      // 温度関連のセンサーフィールドを検出
      const tempFields = Object.keys(sensorData).filter(key => 
        key.includes('Temp') && typeof sensorData[key] === 'number'
      );
      
      if (tempFields.length > 0) {
        // デバイスの部門に対応するtemperature_itemsを取得
        const { data: tempItems, error: itemsError } = await supabase
          .from('temperature_items')
          .select('id, item_name, display_name')
          .eq('department_id', deviceData.department_id)
          .eq('facility_id', deviceData.facility_id)
          .order('display_order', { ascending: true })
          .limit(tempFields.length);
        
        if (!itemsError && tempItems && tempItems.length > 0) {
          // 自動マッピングを作成
          const autoMappings = [];
          
          for (let i = 0; i < Math.min(tempFields.length, tempItems.length); i++) {
            autoMappings.push({
              sensor_device_id: deviceData.id,
              sensor_type: tempFields[i],
              temperature_item_id: tempItems[i].id,
              offset_value: 0
            });
          }
          
          // マッピングをDBに保存
          if (autoMappings.length > 0) {
            const { data: savedMappings, error: saveMappingError } = await supabase
              .from('sensor_mappings')
              .insert(autoMappings)
              .select('sensor_type, temperature_item_id, offset_value');
            
            if (!saveMappingError && savedMappings) {
              console.log(`デバイス ${deviceData.id} に ${savedMappings.length} 件の自動マッピングを作成しました`);
              // 作成したマッピングを使用
              await processTemperatureRecord(deviceData, sensorData, savedMappings);
              
              const endTime = Date.now();
              return NextResponse.json({ 
                status: 'success_with_auto_mapping', 
                message: '自動マッピングでデータを記録しました',
                device_status: 'assigned',
                is_new_device: isNewDevice,
                sensor_log_id: sensorLog.id,
                auto_mappings_created: savedMappings.length,
                processingTime: endTime - startTime
              });
            }
          }
        }
      }
      
      console.log(`自動マッピングできませんでした。センサーログのみ保存します。`);
      
      const endTime = Date.now();
      return NextResponse.json({ 
        status: 'log_only_no_mapping', 
        message: 'マッピングがないため、温度記録には変換されませんでした',
        device_status: 'assigned_no_mapping',
        is_new_device: isNewDevice,
        sensor_log_id: sensorLog.id,
        processingTime: endTime - startTime
      });
    }
    
    // 6. マッピングに基づいて温度記録を処理
    await processTemperatureRecord(deviceData, sensorData, mappings);
    
    const endTime = Date.now();
    console.log(`センサーAPI: 処理完了 (${endTime - startTime}ms)`);
    
    return NextResponse.json({ 
      status: 'success', 
      message: 'センサーデータを正常に記録しました',
      device_status: 'assigned',
      is_new_device: isNewDevice,
      sensor_log_id: sensorLog.id,
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

// 温度記録処理の補助関数
async function processTemperatureRecord(
  deviceData: { id: string; device_name: string; facility_id: string; department_id: string; location?: string },
  sensorData: Record<string, any>,
  mappings: Array<{ sensor_type: string; temperature_item_id: string; offset_value: number }>
) {
  try {
    // 1. 現在日付（YYYY-MM-DD形式）- 日本時間で取得
    const recordDate = getJstDateString();
    
    // 2. 既存レコードをチェック（同じ日に既に記録があるか）
    const { data: existingRecord, error: recordError } = await supabase
      .from('temperature_records')
      .select('id')
      .eq('facility_id', deviceData.facility_id)
      .eq('department_id', deviceData.department_id)
      .eq('record_date', recordDate)
      .eq('is_auto_recorded', true) // 自動記録されたものだけをチェック
      .single();
    
    let recordId;
    
    if (recordError || !existingRecord) {
      console.log(`新しい温度記録を作成: 施設ID ${deviceData.facility_id}, 部署ID ${deviceData.department_id}`);
      
      // 3. 新しいレコードを作成
      const { data: newRecord, error: insertError } = await supabase
        .from('temperature_records')
        .insert({
          facility_id: deviceData.facility_id,
          department_id: deviceData.department_id,
          record_date: recordDate,
          is_auto_recorded: true,
          created_by: 'system',
          note: `センサー「${deviceData.device_name}」からの自動記録 (${deviceData.location || '場所未設定'})`
        })
        .select('id')
        .single();
        
      if (insertError || !newRecord) {
        console.error('温度記録の作成に失敗:', insertError);
        throw insertError;
      }
      
      recordId = newRecord.id;
    } else {
      recordId = existingRecord.id;
      console.log(`既存の温度記録を更新: ID ${recordId}`);
    }
    
    // 4. 各センサーデータの処理を並列実行
    const detailUpdates = mappings.map(mapping => {
      // センサーデータ取得（sensorDataから直接値を取得）
      const sensorValue = sensorData[mapping.sensor_type];
      
      // 値が存在しなければスキップ
      if (sensorValue === undefined || sensorValue === null) {
        return Promise.resolve();
      }
      
      // オフセット値を適用
      const adjustedValue = sensorValue + (mapping.offset_value || 0);
      
      // 既存レコードをチェックして、新規追加か更新かを判断して処理
      return processDetailRecord(recordId, mapping.temperature_item_id, adjustedValue);
    });
    
    // すべての詳細レコード処理を待機
    await Promise.all(detailUpdates.filter(Boolean));
    
    return recordId;
  } catch (error) {
    console.error('温度記録処理エラー:', error);
    throw error;
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
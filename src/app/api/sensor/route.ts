// src/app/api/sensor/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service'; // サービスロールクライアント
import { getJstTimestamp, getJstDateString } from '@/lib/utils';
import type { Database } from '@/types/supabase';

type SB = ReturnType<typeof createServiceClient>;
type SensorDeviceRow =
  Database['public']['Tables']['sensor_devices']['Row'];
type MappingRow =
  Database['public']['Tables']['sensor_mappings']['Row'];

export async function POST(request: Request) {
  const start = Date.now();

  try {
    console.log('[sensor] API request started');
    
    /* ───────────────────────── 1) Supabase */
    const supabase = createServiceClient();
    console.log('[sensor] Supabase client created');

    /* ───────────────────────── 2) payload */
    const payload = await request.json();
    console.log('[sensor] Payload received:', JSON.stringify(payload, null, 2));
    const {
      ahtTemp,
      ahtHum,
      bmpTemp,
      bmpPres,
      batteryVolt,
      deviceId,
      token,
      ipAddress,
      timestamp,
      alert,
      diagnostic,
      ahtStatus,
      bmpStatus,
      device_id,
      device_name,
      mac_address,
      data,
    } = payload as Record<string, any>;

    /* ───────────────────────── 3) 正規化 */
    const effectiveDeviceId: string | null = device_id || deviceId || null;
    const sensorData =
      data ?? { 
        ahtTemp, 
        ahtHum, 
        bmpTemp, 
        bmpPres, 
        batteryVolt,
        timestamp,
        alert,
        diagnostic,
        ahtStatus,
        bmpStatus
      };
    const ip =
      request.headers.get('x-forwarded-for') ||
      ipAddress ||
      'unknown';

    console.log('[sensor] from', ip, 'deviceId=', effectiveDeviceId, 'diagnostic=', diagnostic, 'alert=', alert);

    /* ───────────────────────── 4) デバイス検索とトークン認証 */
    let device:
      | Pick<
          SensorDeviceRow,
          'id' | 'device_name' | 'facility_id' | 'department_id' | 'location' | 'auth_token'
        >
      | null = null;
    
    console.log('[sensor] Looking for device with ID:', effectiveDeviceId);
    
    if (effectiveDeviceId) {
      try {
        const { data: deviceData, error: deviceError } = await supabase
          .from('sensor_devices')
          .select('id,device_name,facility_id,department_id,location,auth_token')
          .eq('device_id', effectiveDeviceId)
          .single();
        
        console.log('[sensor] Device query result:', { deviceData, deviceError });
        
        if (deviceError && deviceError.code !== 'PGRST116') {
          throw new Error(`Device query failed: ${deviceError.message}`);
        }
      
        if (deviceData) {
          // トークン認証（既存デバイスの場合）
          if (deviceData.auth_token && token !== deviceData.auth_token) {
            console.log('[sensor] Token mismatch for device:', effectiveDeviceId);
            return NextResponse.json(
              { status: 'error', message: 'Invalid token' },
              { status: 401 }
            );
          }
          device = deviceData;
          console.log('[sensor] Found existing device:', device.device_name);
        }
      } catch (deviceQueryError) {
        console.error('[sensor] Error querying device:', deviceQueryError);
        throw deviceQueryError;
      }
    }

    // IPアドレスでの検索（デバイスIDがない場合のフォールバック）
    if (!device && ip !== 'unknown') {
      const { data: deviceByIp } = await supabase
        .from('sensor_devices')
        .select('id,device_name,facility_id,department_id,location,auth_token')
        .eq('ip_address', ip)
        .single();
      
      if (deviceByIp) device = deviceByIp;
    }

    let isNewDevice = false;

    /* ───────────────────────── 5) 未登録は自動登録 */
    if (!device && effectiveDeviceId) {
      const { data: defFac } = await supabase
        .from('facilities')
        .select('id')
        .limit(1)
        .single();

      if (!defFac) {
        await supabase.from('sensor_logs').insert({
          raw_data: sensorData,
          ip_address: ip,
          device_id: effectiveDeviceId,
          recorded_at: getJstTimestamp(),
        });
        return NextResponse.json(
          { status: 'error', message: '施設が未登録です。' },
          { status: 200 },
        );
      }

      const { data: newDev } = await supabase
        .from('sensor_devices')
        .insert({
          device_id: effectiveDeviceId,
          device_name:
            device_name || `新規センサー ${effectiveDeviceId.slice(0, 8)}`,
          mac_address,
          ip_address: ip !== 'unknown' ? ip : null,
          facility_id: defFac.id,
          is_active: true,
          last_seen: getJstTimestamp(),
          location: '未設定',
          auth_token: token || null, // 新規デバイスのトークンを保存
        })
        .select('id,device_name,facility_id,department_id,location,auth_token')
        .single();

      device = newDev;
      isNewDevice = true;
      
      console.log('[sensor] New device registered:', effectiveDeviceId);
    }

    /* ───────────────────────── 6) 生ログ保存 */
    console.log('[sensor] Saving sensor log...');
    
    try {
      const { data: sensorLog, error: logError } = await supabase
        .from('sensor_logs')
        .insert({
          sensor_device_id: device?.id ?? null,
          raw_data: sensorData,
          ip_address: ip,
          device_id: effectiveDeviceId,
          recorded_at: getJstTimestamp(),
          is_processed: Boolean(device?.department_id),
        })
        .select('id')
        .single();
      
      if (logError) {
        console.error('[sensor] Sensor log save error:', logError);
        throw new Error(`Sensor log save failed: ${logError.message}`);
      }
      
      console.log('[sensor] Sensor log saved with ID:', sensorLog?.id);
    
      // 以降でsensorLogを参照するために変数を設定
      var savedSensorLog = sensorLog;
    } catch (logSaveError) {
      console.error('[sensor] Error saving sensor log:', logSaveError);
      throw logSaveError;
    }

    /* ───────────────────────── 7) バッテリー警告の処理 */
    if (alert === 'low_battery' && device) {
      // バッテリー警告の通知を作成
      await supabase.from('user_notifications').insert({
        user_id: 'system', // システム通知として記録
        title: 'センサーバッテリー低下警告',
        message: `センサー「${device.device_name}」のバッテリー電圧が低下しています (${batteryVolt}V)`,
        notification_type: 'battery_warning',
        related_data: {
          device_id: device.id,
          device_name: device.device_name,
          battery_voltage: batteryVolt,
          location: device.location,
        },
      });
      
      console.log('[sensor] Battery warning logged for device:', device.device_name, 'voltage:', batteryVolt);
    }

    /* ───────────────────────── 8) 診断情報の処理 */
    if (diagnostic && device) {
      // 診断情報をログに記録
      const diagnosticData = {
        ahtStatus,
        bmpStatus,
        batteryVolt,
        timestamp,
        ip_address: ip,
      };
      
      console.log('[sensor] Diagnostic data received:', diagnosticData);
      
      // センサー状態に異常がある場合は通知
      if (ahtStatus !== 'OK' || bmpStatus !== 'OK') {
        await supabase.from('user_notifications').insert({
          user_id: 'system',
          title: 'センサー異常検知',
          message: `センサー「${device.device_name}」に異常が検知されました。AHT: ${ahtStatus}, BMP: ${bmpStatus}`,
          notification_type: 'sensor_error',
          related_data: {
            device_id: device.id,
            device_name: device.device_name,
            diagnostic_data: diagnosticData,
          },
        });
      }
    }

    /* ───────────────────────── 9) 部署未割当なら終了 */
    if (!device || !device.department_id || !device.facility_id) {
      return NextResponse.json(
        {
          status: 'log_only',
          device_status: device
            ? device.department_id
              ? 'unassigned_facility'
              : 'unassigned'
            : 'unregistered',
          is_new_device: isNewDevice,
          sensor_log_id: savedSensorLog!.id,
          processingTime: Date.now() - start,
        },
        { status: 200 },
      );
    }

    /* ───────────────────────── 10) last_seen 更新 */
    const update: Partial<SensorDeviceRow> = { 
      last_seen: getJstTimestamp(),
      last_connection: getJstTimestamp(), // 最終接続時刻も更新
    };
    if (ip !== 'unknown') update.ip_address = ip;
    
    // トークンが送信されていて、まだ保存されていない場合は保存
    if (token && !device.auth_token) {
      update.auth_token = token;
    }
    
    console.log('[sensor] Updating device with:', update);
    
    try {
      const { error: updateError } = await supabase
        .from('sensor_devices')
        .update(update)
        .eq('id', device.id);
      
      if (updateError) {
        console.error('[sensor] Device update error:', updateError);
        throw new Error(`Device update failed: ${updateError.message}`);
      }
      
      console.log('[sensor] Device updated successfully');
    } catch (updateErr) {
      console.error('[sensor] Error updating device:', updateErr);
      throw updateErr;
    }

    /* ───────────────────────── 11) マッピング → 温度記録 */
    const { data: mappings } = await supabase
      .from('sensor_mappings')
      .select('sensor_type,temperature_item_id,offset_value')
      .eq('sensor_device_id', device.id);

    if (!mappings?.length) {
      return NextResponse.json(
        {
          status: 'log_only_no_mapping',
          sensor_log_id: savedSensorLog!.id,
          processingTime: Date.now() - start,
          diagnostic: diagnostic || false,
          alert: alert || null,
        },
        { status: 200 },
      );
    }

    // 診断モードの場合は温度記録をスキップ
    if (!diagnostic) {
      await processTemperatureRecord(
        supabase,
        device as NonNullable<typeof device>, // facility_id/department_id 非 null を保証
        sensorData,
        mappings,
      );
    }

    return NextResponse.json(
      {
        status: 'success',
        sensor_log_id: savedSensorLog!.id,
        processingTime: Date.now() - start,
        diagnostic: diagnostic || false,
        alert: alert || null,
        device_name: device.device_name,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error('[sensor] API error:', e);
    console.error('[sensor] Error stack:', e instanceof Error ? e.stack : 'No stack trace');
    return NextResponse.json({ 
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
      error_type: e instanceof Error ? e.constructor.name : 'Unknown'
    }, { status: 500 });
  }
}

/* ───────────────────────── ヘルパー ───────────────────────── */
async function processTemperatureRecord(
  supabase: SB,
  device: {
    id: string;
    device_name: string;
    facility_id: string | null;
    department_id: string | null;
    location: string | null;
  },
  sensor: Record<string, any>,
  mappings: {
    sensor_type: string;
    temperature_item_id: string | null;
    offset_value: number | null;
  }[],
) {
  /* facility / department が null の場合は何もしない */
  if (!device.facility_id || !device.department_id) return;

  const recordDate = getJstDateString();

  /* 1) ヘッダー行検索 / 作成 */
  const { data: header } = await supabase
    .from('temperature_records')
    .select('id')
    .eq('facility_id', device.facility_id)
    .eq('department_id', device.department_id)
    .eq('record_date', recordDate)
    .eq('is_auto_recorded', true)
    .single();

  let recordId = header?.id as string | undefined;

  if (!recordId) {
    const { data: inserted } = await supabase
      .from('temperature_records')
      .insert({
        facility_id: device.facility_id,
        department_id: device.department_id,
        record_date: recordDate,
        is_auto_recorded: true,
        created_by: 'system',
        note: `センサー「${device.device_name}」自動記録`,
      })
      .select('id')
      .single();

    if (!inserted) throw new Error('temperature_records insert failed');
    recordId = inserted.id;
  }

  /* 2) 詳細レコード更新 */
  await Promise.all(
    mappings.map(async m => {
      if (!m.temperature_item_id) return;
      const raw = sensor[m.sensor_type];
      if (raw == null) return;

      const value = raw + (m.offset_value ?? 0);

      const { data: detail } = await supabase
        .from('temperature_record_details')
        .select('id')
        .eq('temperature_record_id', recordId!)
        .eq('temperature_item_id', m.temperature_item_id)
        .single();

      if (!detail) {
        return supabase.from('temperature_record_details').insert({
          temperature_record_id: recordId,
          temperature_item_id: m.temperature_item_id,
          value,
          data_source: 'sensor',
        });
      } else {
        return supabase
          .from('temperature_record_details')
          .update({ value, data_source: 'sensor' })
          .eq('id', detail.id);
      }
    }),
  );
}

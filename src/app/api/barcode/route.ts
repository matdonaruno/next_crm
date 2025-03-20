import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getJstTimestamp } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const { barcode, format, userId, facilityId } = await request.json();

    if (!barcode) {
      return NextResponse.json({ 
        status: 'error',
        message: 'バーコードデータが必要です' 
      }, { status: 400 });
    }

    // バーコードのデコード履歴をログに残す
    await supabase.from('barcode_scans').insert({
      barcode_data: barcode,
      barcode_format: format || 'unknown',
      user_id: userId,
      facility_id: facilityId,
      decoded_at: getJstTimestamp() // 日本時間のタイムスタンプを使用
    });

    // TODO: バーコードデコード処理
    // 現状は単純に受け取ったバーコードをそのまま返す
    return NextResponse.json({
      status: 'success',
      barcode: barcode,
      format: format,
      timestamp: getJstTimestamp() // 日本時間のタイムスタンプを使用
    });
  } catch (error) {
    console.error('Barcode API error:', error);
    return NextResponse.json({ 
      status: 'error', 
      message: 'Internal server error' 
    }, { status: 500 });
  }
} 
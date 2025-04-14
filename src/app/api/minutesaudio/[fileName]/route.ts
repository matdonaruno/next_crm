import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileName: string } }
) {
  console.log('音声ファイル取得APIを実行 (minutesaudio):', params.fileName);
  
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    
    const fileName = decodeURIComponent(params.fileName);
    console.log(`音声ファイル取得リクエスト: ${fileName}`);
    
    // 音声ファイルのダウンロード
    const { data, error } = await supabase.storage
      .from('minutesaudio')
      .download(fileName);
    
    if (error || !data) {
      console.error('音声ファイル取得エラー:', error);
      return new NextResponse('ファイルが見つかりませんでした', { status: 404 });
    }
    
    // レスポンスヘッダーの設定
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Cache-Control', 'public, max-age=3600');
    
    // ストリームとしてファイルを返す
    return new NextResponse(data, {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('音声ファイル取得処理エラー:', error);
    return new NextResponse('サーバーエラーが発生しました', { status: 500 });
  }
} 
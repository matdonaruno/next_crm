import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileName: string } }
) {
  try {
    const fileName = params.fileName;
    
    // 直接ストレージURLを構築 - パブリックアクセスの場合
    const publicStorageUrl = `https://bsgvaomswzkywbiubtjg.supabase.co/storage/v1/object/public/meeting_minutes/meeting_recordings/${fileName}`;
    
    // 1. まず直接パブリックURLでアクセスを試みる
    try {
      const publicResponse = await fetch(publicStorageUrl, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (publicResponse.ok) {
        const fileBuffer = await publicResponse.arrayBuffer();
        
        // レスポンスヘッダーを設定
        const headers = new Headers();
        headers.set('Content-Type', 'audio/wav');
        headers.set('Content-Length', fileBuffer.byteLength.toString());
        headers.set('Cache-Control', 'public, max-age=3600');
        
        return new NextResponse(fileBuffer, {
          status: 200,
          headers
        });
      }
    } catch (publicError) {
      console.error('パブリックアクセスエラー:', publicError);
    }
    
    // 2. Supabaseクライアントを使用した認証付きアクセスを試みる
    try {
      // Supabaseクライアントの初期化（サーバーサイド）
      const cookieStore = cookies();
      const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
      
      // パブリックURLが取得できるか確認
      try {
        const { data: publicUrlData } = await supabase.storage
          .from('meeting_minutes')
          .getPublicUrl(`meeting_recordings/${fileName}`);
          
        if (publicUrlData?.publicUrl) {
          const publicUrlResponse = await fetch(publicUrlData.publicUrl, {
            headers: { 'Cache-Control': 'no-cache' }
          });
          
          if (publicUrlResponse.ok) {
            const fileBuffer = await publicUrlResponse.arrayBuffer();
            
            // レスポンスヘッダーを設定
            const headers = new Headers();
            headers.set('Content-Type', 'audio/wav');
            headers.set('Content-Length', fileBuffer.byteLength.toString());
            headers.set('Cache-Control', 'public, max-age=3600');
            
            return new NextResponse(fileBuffer, {
              status: 200,
              headers
            });
          }
        }
      } catch (publicUrlError) {
        console.error('パブリックURL生成エラー:', publicUrlError);
      }
      
      // サーバーサイドで署名付きURLを生成
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('meeting_minutes')
        .createSignedUrl(`meeting_recordings/${fileName}`, 60);
        
      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new Error('署名付きURLの生成に失敗しました');
      }
      
      // 署名付きURLを使用してファイルを取得
      const signedResponse = await fetch(signedUrlData.signedUrl);
      
      if (!signedResponse.ok) {
        throw new Error(`署名付きURLでのアクセスに失敗しました: ${signedResponse.status}`);
      }
      
      const fileBuffer = await signedResponse.arrayBuffer();
      
      // レスポンスヘッダーを設定
      const headers = new Headers();
      headers.set('Content-Type', 'audio/wav');
      headers.set('Content-Length', fileBuffer.byteLength.toString());
      headers.set('Cache-Control', 'public, max-age=3600');
      
      return new NextResponse(fileBuffer, {
        status: 200,
        headers
      });
    } catch (authError) {
      console.error('認証付きアクセスエラー:', authError);
    }
    
    // 3. 上記の方法が全て失敗した場合、エラーを返す
    return NextResponse.json({ 
      error: 'ファイルへのアクセスに失敗しました',
      message: 'ファイルを取得できませんでした',
      suggestion: 'Supabaseのストレージ設定を確認し、このバケットをパブリックに設定するか、適切なアクセス権限を付与してください。'
    }, { status: 404 });
  } catch (error) {
    console.error('音声ファイル取得API エラー:', error);
    return NextResponse.json({ 
      error: '内部サーバーエラー',
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    }, { status: 500 });
  }
} 
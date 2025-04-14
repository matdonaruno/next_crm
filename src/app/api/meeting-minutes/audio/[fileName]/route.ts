import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileName: string } }
) {
  console.log('音声ファイル取得APIを実行:', params.fileName);
  
  try {
    // パラメータからファイル名を取得し、URLデコード
    const fileName = decodeURIComponent(params.fileName);
    console.log('デコード後のファイル名:', fileName);
    
    const bucketName = 'meeting_recordings'; // プライベートバケット名（ハイフンからアンダースコアに修正）
    
    // クライアント初期化（サーバーサイドで認証済みクライアント）
    const supabase = createRouteHandlerClient({
      cookies
    });
    
    // 署名付きURLでの取得
    try {
      console.log('署名付きURL取得試行:', bucketName, fileName);
      
      // 署名付きURLを取得（プライベートバケット用）
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 300); // 5分間有効
      
      if (error) {
        console.error('署名付きURL取得エラー:', error);
        console.error('署名付きURL取得エラー詳細:', JSON.stringify(error));
        throw error;
      }
      
      if (data && data.signedUrl) {
        console.log('署名付きURL取得成功:', data.signedUrl);
        
        // 署名付きURLからファイルを取得
        const response = await fetch(data.signedUrl);
        
        if (!response.ok) {
          console.error('署名付きURLからのファイル取得エラー:', response.status, response.statusText);
          throw new Error(`署名付きURLからのファイル取得エラー: ${response.status} ${response.statusText}`);
        }
        
        // ファイル名のみを抽出（パスを除去）
        const fileNameOnly = fileName.split('/').pop() || fileName;
        
        // レスポンスを返す
        const arrayBuffer = await response.arrayBuffer();
        return new NextResponse(arrayBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': `inline; filename=${fileNameOnly}`,
          },
        });
      }
    } catch (error) {
      console.error('署名付きURL取得エラー:', error);
    }
    
    // ダイレクトなストレージアクセス（バックアップ方法）
    try {
      console.log('ストレージから直接ダウンロード試行:', bucketName, fileName);
      
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(fileName);
      
      if (error) {
        console.error('ダイレクトダウンロードエラー:', error);
        console.error('ダイレクトダウンロードエラー詳細:', JSON.stringify(error));
        throw error;
      }
      
      if (data) {
        console.log('ダイレクトダウンロード成功');
        
        // ファイル名のみを抽出（パスを除去）
        const fileNameOnly = fileName.split('/').pop() || fileName;
        
        // Blobからバイナリを取得してレスポンスを返す
        const arrayBuffer = await data.arrayBuffer();
        return new NextResponse(arrayBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': `inline; filename=${fileNameOnly}`,
          },
        });
      }
    } catch (error) {
      console.error('ダイレクトダウンロードエラー:', error);
    }
    
    // すべての方法が失敗した場合
    console.error('すべての方法で音声ファイルの取得に失敗しました');
    return NextResponse.json(
      { error: '音声ファイルの取得に失敗しました' },
      { status: 404 }
    );
    
  } catch (error) {
    console.error('音声ファイル取得APIエラー:', error);
    return NextResponse.json(
      { error: '音声ファイルの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 
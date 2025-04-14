import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Supabaseクライアントの初期化
    const supabase = createServerSupabaseClient();
    
    // セッションの確認（認証済みかチェック）
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }
    
    // FormDataからファイルを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 400 }
      );
    }
    
    // ファイル情報をログ出力
    console.log('アップロードファイル情報:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    
    // バケットの存在確認
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === 'meeting_minutes');
    
    // バケットが存在しない場合は作成
    if (!bucketExists) {
      const { error: createError } = await supabase.storage.createBucket('meeting_minutes', {
        public: false,
        fileSizeLimit: 52428800, // 50MB
      });
      
      if (createError) {
        console.error('バケット作成エラー:', createError);
        return NextResponse.json(
          { error: 'ストレージバケットの作成に失敗しました' },
          { status: 500 }
        );
      }
    }
    
    // ファイル名の生成（一意性を確保）
    const fileExt = file.name.split('.').pop();
    const filePath = `meeting_recordings/${Date.now()}.${fileExt}`;
    
    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    
    // Supabaseストレージにアップロード
    const { error: uploadError } = await supabase.storage
      .from('meeting_minutes')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        cacheControl: '3600',
      });
    
    if (uploadError) {
      console.error('Supabaseアップロードエラー:', uploadError);
      return NextResponse.json(
        { error: `ファイルのアップロードに失敗しました: ${uploadError.message}` },
        { status: 500 }
      );
    }
    
    // 成功レスポンス
    return NextResponse.json({
      success: true,
      path: filePath,
      message: 'ファイルが正常にアップロードされました'
    });
  } catch (error) {
    console.error('音声ファイルアップロードエラー:', error);
    return NextResponse.json(
      { error: '音声ファイルのアップロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 
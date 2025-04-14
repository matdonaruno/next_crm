import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  console.log('音声アップロードAPI呼び出し');
  
  try {
    // Supabaseクライアントの初期化
    const supabase = await createServerSupabaseClient();
    
    // セッションの確認（認証済みかチェック）
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }
    
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const fileName = formData.get('fileName') as string;
    
    if (!audioFile || !fileName) {
      return NextResponse.json({ success: false, error: '音声ファイルまたはファイル名が提供されていません' }, { status: 400 });
    }
    
    console.log(`アップロード処理: ファイル名=${fileName}, サイズ=${audioFile.size}バイト`);
    
    // ファイル情報をログ出力
    console.log('アップロードファイル情報:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    });
    
    // バケットの存在確認
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('バケット一覧取得エラー:', listError);
      return NextResponse.json(
        { error: 'ストレージ設定の確認に失敗しました' },
        { status: 500 }
      );
    }
    
    const minutesAudioBucketExists = buckets?.some((bucket) => bucket.name === 'minutesaudio');
    
    // バケットが存在しない場合はエラーを返す
    if (!minutesAudioBucketExists) {
      console.error('必要なストレージバケット(minutesaudio)が存在しません');
      return NextResponse.json(
        { error: 'ストレージの設定が完了していません。管理者に連絡してください。' },
        { status: 400 }
      );
    }
    
    // Supabaseのバケットにファイルをアップロード
    const { data, error: uploadError } = await supabase.storage
      .from('minutesaudio')
      .upload(fileName, audioFile, {
        contentType: audioFile.type,
        cacheControl: '3600',
      });
    
    if (uploadError) {
      console.error('ファイルアップロードエラー:', uploadError);
      return NextResponse.json(
        { error: 'ファイルのアップロードに失敗しました: ' + uploadError.message },
        { status: 500 }
      );
    }
    
    // アップロード成功
    console.log('ファイルアップロード成功:', data.path);
    
    return NextResponse.json({
      success: true,
      path: data.path,
      url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/minutesaudio/${data.path}`
    });
  } catch (error) {
    console.error('音声ファイルアップロードエラー:', error);
    return NextResponse.json(
      { error: '音声ファイルのアップロード中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 
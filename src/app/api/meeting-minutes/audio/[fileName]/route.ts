import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileName: string } }
) {
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
    
    // パラメータからファイル名を取得
    const fileName = params.fileName;
    if (!fileName) {
      return NextResponse.json(
        { error: 'ファイル名が指定されていません' },
        { status: 400 }
      );
    }
    
    console.log('ダウンロードするファイル:', fileName);
    
    // ファイルをダウンロード
    const { data, error } = await supabase.storage
      .from('meeting_minutes')
      .download(fileName);
      
    if (error) {
      console.error('ファイルダウンロードエラー:', error);
      return NextResponse.json(
        { error: 'ファイルのダウンロードに失敗しました' },
        { status: 500 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { error: 'ファイルが見つかりません' },
        { status: 404 }
      );
    }
    
    // ファイルの拡張子からContent-Typeを決定
    let contentType = 'application/octet-stream';
    if (fileName.endsWith('.wav')) {
      contentType = 'audio/wav';
    } else if (fileName.endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    }
    
    // ファイルを返す
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename=${fileName.split('/').pop()}`,
      },
    });
  } catch (error) {
    console.error('音声ファイル取得エラー:', error);
    return NextResponse.json(
      { error: '音声ファイルの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 
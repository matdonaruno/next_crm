import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileName: string } }
) {
  console.log('音声ファイル取得APIを実行:', params.fileName);
  
  try {
    // パラメータからファイル名を取得
    const fileName = params.fileName;
    if (!fileName) {
      return NextResponse.json(
        { error: 'ファイル名が指定されていません' },
        { status: 400 }
      );
    }
    
    // 完全なパスを構築
    let fullPath = '';
    if (fileName.includes('/')) {
      // すでにパスが含まれている場合はそのまま使用
      fullPath = fileName;
    } else if (fileName.includes('meeting_recordings')) {
      // meeting_recordingsディレクトリが含まれている場合
      fullPath = fileName;
    } else {
      // ファイル名のみの場合はディレクトリを追加
      fullPath = `meeting_recordings/${fileName}`;
    }
    
    console.log('-----------------------------------------------------');
    console.log('デバッグ情報:');
    console.log('取得するファイルパス:', fullPath);
    console.log('バケット名:', 'meeting_minutes');
    console.log('リクエストURL:', request.url);
    
    // セッション情報のログ出力
    try {
      const tempSupabase = createServerSupabaseClient();
      const { data: { session }, error: sessionError } = await tempSupabase.auth.getSession();
      
      console.log('セッション情報:', { 
        hasSession: !!session,
        userId: session?.user?.id || 'なし',
        error: sessionError ? sessionError.message : 'なし'
      });
      
      // Cookieのチェック
      try {
        // Next.js 14.xではcookies()は非同期API
        const cookieStore = await cookies();
        const authCookie = cookieStore.get('sb-bsgvaomswzkywbiubtjg-auth-token');
        console.log('認証Cookieの状態:', {
          exists: !!authCookie,
          value: authCookie ? '存在します（値は非表示）' : '存在しません',
        });
      } catch (cookieErr) {
        console.error('Cookie確認エラー:', cookieErr);
      }
    } catch (sessErr) {
      console.error('セッション確認エラー:', sessErr);
    }
    
    // バケット内のファイル一覧を取得して確認
    try {
      const supabase = createServerSupabaseClient();
      
      // バケット一覧取得
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      if (bucketsError) {
        console.error('バケット一覧取得エラー:', bucketsError);
      } else {
        console.log('バケット一覧:', buckets?.map(b => b.name));
        
        // バケットが存在するか確認
        if (!buckets || buckets.length === 0 || !buckets.some(b => b.name === 'meeting_minutes')) {
          console.error('meeting_minutesバケットが存在しません');
          return NextResponse.json({ 
            error: 'バケットが存在しません',
            message: 'meeting_minutesストレージバケットが見つかりません',
            suggestion: 'Supabaseダッシュボードでバケットを作成してください' 
          }, { status: 404 });
        }
      }
      
      // ファイル一覧取得
      const { data: files, error: filesError } = await supabase.storage
        .from('meeting_minutes')
        .list('meeting_recordings');
      
      if (filesError) {
        console.error('ファイル一覧取得エラー:', filesError);
      } else {
        console.log('ファイル一覧 (meeting_recordings):', 
          files?.map(f => ({ name: f.name, size: f.metadata?.size })));
        
        // ファイル名のみを取得（パスを除去）
        const fileNameOnly = fileName.includes('/') 
          ? fileName.split('/').pop() 
          : fileName;
        
        // ファイルが存在するか確認
        const fileExists = files?.some(f => f.name === fileNameOnly);
        console.log('ファイル存在チェック:', {
          searchingFor: fileNameOnly,
          exists: fileExists
        });
        
        if (!fileExists) {
          console.error('警告: 指定されたファイルがストレージバケットに存在しません');
        }
      }
    } catch (listErr) {
      console.error('ファイル一覧取得中のエラー:', listErr);
    }
    
    console.log('-----------------------------------------------------');
    
    // 方法1: 直接ダウンロード - 認証済みクライアントで実行
    try {
      // Supabaseクライアントの初期化
      const supabase = createServerSupabaseClient();
      
      console.log('直接ダウンロード試行...', { fullPath });
      
      const { data, error } = await supabase.storage
        .from('meeting_minutes')
        .download(fullPath);
        
      if (error) {
        console.error('直接ダウンロードエラー:', error);
      } else if (data) {
        console.log('直接ダウンロード成功');
        
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
            'Cache-Control': 'public, max-age=3600'
          },
        });
      }
    } catch (downloadError) {
      console.error('直接ダウンロードエラー:', downloadError);
    }
    
    // 方法2: 署名付きURLでの取得を試みる - privateバケット用
    try {
      // クライアント初期化 - 非同期cookiesを使用
      const supabase = createRouteHandlerClient({
        cookies
      });
      
      // 署名付きURLの生成（10分間有効）
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('meeting_minutes')
        .createSignedUrl(fullPath, 600);
      
      if (signedUrlError) {
        console.error('署名付きURL生成エラー:', signedUrlError);
      } else if (signedUrlData?.signedUrl) {
        console.log('署名付きURL取得成功:', signedUrlData.signedUrl);
        
        // 署名付きURLでファイルを取得
        const response = await fetch(signedUrlData.signedUrl);
        
        // レスポンス詳細をログ出力
        console.log('署名付きURLからのレスポンス:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url
        });
        
        if (response.ok) {
          console.log('署名付きURLからファイル取得成功');
          const arrayBuffer = await response.arrayBuffer();
          
          // レスポンスヘッダーを設定
          const headers = new Headers();
          headers.set('Content-Type', 'audio/wav');
          headers.set('Content-Length', arrayBuffer.byteLength.toString());
          headers.set('Cache-Control', 'public, max-age=3600');
          
          return new NextResponse(arrayBuffer, {
            status: 200,
            headers
          });
        } else {
          console.error('署名付きURLからファイル取得失敗:', response.status);
          
          // エラーの詳細をログ出力
          try {
            const errorText = await response.text();
            console.error('署名付きURL取得エラー詳細:', errorText);
          } catch (e) {
            console.error('エラーテキスト取得失敗:', e);
          }
        }
      }
    } catch (signedUrlError) {
      console.error('署名付きURL取得エラー:', signedUrlError);
    }

    // 方法3: 認証付きの直接ダウンロードを試みる - privateバケット用
    try {
      console.log('方法3: 認証付き直接ダウンロードを試行');
      // クライアント初期化 - cookies()を非同期で使用
      const supabase = createRouteHandlerClient({
        cookies
      });
      
      // ファイルのダウンロード
      const { data, error: downloadError } = await supabase.storage
        .from('meeting_minutes')
        .download(fullPath);

      if (downloadError) {
        console.error('認証付き直接ダウンロードエラー:', downloadError);
      } else if (data) {
        console.log('認証付き直接ダウンロード成功');
        
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
            'Cache-Control': 'public, max-age=3600'
          },
        });
      }
    } catch (downloadError) {
      console.error('認証付き直接ダウンロードエラー:', downloadError);
    }
    
    // 全ての方法が失敗した場合
    console.error('すべてのファイル取得方法が失敗しました');
    return NextResponse.json({
      error: 'ファイルの取得に失敗しました',
      message: 'サーバーでファイルにアクセスできません',
      suggestion: 'Supabaseのバケット権限を確認するか、管理者にお問い合わせください',
      path: fullPath,
      filename: fileName,
      bucket: 'meeting_minutes'
    }, { status: 404 });
  } catch (error) {
    console.error('音声ファイル取得API全体エラー:', error);
    return NextResponse.json({
      error: '内部サーバーエラー',
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    }, { status: 500 });
  }
} 
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 特定の会議議事録を取得するAPI
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    
    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    console.log(`API: 議事録ID ${id} の詳細を取得します`);

    // 対象の議事録データを取得
    const { data, error } = await supabase
      .from('meeting_minutes')
      .select(`
        id,
        meeting_type_id,
        title,
        meeting_date,
        recorded_by,
        facility_id,
        department_id,
        attendees,
        content,
        summary,
        audio_file_path,
        is_transcribed,
        keywords,
        created_at,
        updated_at,
        segments,
        speakers,
        meeting_types(name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(`API: 議事録ID ${id} の取得エラー:`, error);
      
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '議事録が見つかりません' }, { status: 404 });
      }
      
      return NextResponse.json(
        { error: 'データ取得中にエラーが発生しました', details: error }, 
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// 特定の会議議事録を更新するAPI
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    
    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    // リクエストボディの解析
    const body = await request.json();
    
    console.log(`API: 議事録ID ${id} を更新します:`, Object.keys(body));

    // 更新するデータを準備
    const updateData: Record<string, any> = {};
    
    // 許可されたフィールドのみ更新
    const allowedFields = [
      'title', 'meeting_date', 'attendees', 'content', 
      'summary', 'keywords', 'is_transcribed', 'segments', 'speakers'
    ];
    
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        // JSONフィールドの処理（speakersとsegments）
        if ((field === 'segments' || field === 'speakers') && body[field] !== null) {
          updateData[field] = typeof body[field] === 'string' 
            ? body[field] 
            : JSON.stringify(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    });

    // データが空の場合は更新しない
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '更新するデータがありません' }, { status: 400 });
    }

    // 更新を実行
    const { data, error } = await supabase
      .from('meeting_minutes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`API: 議事録ID ${id} の更新エラー:`, error);
      return NextResponse.json(
        { error: 'データ更新中にエラーが発生しました', details: error }, 
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// 特定の会議議事録を削除するAPI
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    
    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    console.log(`API: 議事録ID ${id} を削除します`);

    // 削除を実行
    const { error } = await supabase
      .from('meeting_minutes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`API: 議事録ID ${id} の削除エラー:`, error);
      return NextResponse.json(
        { error: 'データ削除中にエラーが発生しました', details: error }, 
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
} 
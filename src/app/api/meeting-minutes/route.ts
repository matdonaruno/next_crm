import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { MeetingMinute } from '@/types/meeting-minutes';

// 会議議事録の取得API
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // URLパラメータの取得
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const facilityId = searchParams.get('facilityId');
    const departmentId = searchParams.get('departmentId');
    const meetingTypeId = searchParams.get('meetingTypeId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    // クエリの構築
    let supabaseQuery = supabase
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
      `);
    
    // 検索条件の適用
    if (query) {
      supabaseQuery = supabaseQuery.or(
        `title.ilike.%${query}%,content.ilike.%${query}%,summary.ilike.%${query}%`
      );
    }
    
    if (facilityId) {
      console.log('API: 施設IDで絞り込み:', facilityId);
      // 施設IDフィルタを有効化
      supabaseQuery = supabaseQuery.eq('facility_id', facilityId);
    }
    
    if (departmentId) {
      supabaseQuery = supabaseQuery.eq('department_id', departmentId);
    }
    
    if (meetingTypeId) {
      supabaseQuery = supabaseQuery.eq('meeting_type_id', meetingTypeId);
    }
    
    if (startDate) {
      supabaseQuery = supabaseQuery.gte('meeting_date', startDate);
    }
    
    if (endDate) {
      supabaseQuery = supabaseQuery.lte('meeting_date', endDate);
    }

    // データ取得の実行
    console.log('API: 実行するクエリ:', supabaseQuery);
    const { data, error, count } = await supabaseQuery.order('meeting_date', { ascending: false });

    if (error) {
      console.error('API: データ取得エラー:', error);
      return NextResponse.json({ error: 'データ取得中にエラーが発生しました', details: error }, { status: 500 });
    }

    console.log(`API: 取得したデータ数: ${data?.length || 0}`);
    if (data && data.length > 0) {
      console.log('API: 最初のデータのID:', data[0].id);
    } else {
      console.log('API: データがありません。RLSの設定を確認してください。');
      
      // RLSのテスト - 修正バージョン
      try {
        console.log('API: RLSテスト - 全レコード取得');
        const { data: allData, error: allError } = await supabase
          .from('meeting_minutes')
          .select('id, facility_id')
          .limit(10);
          
        console.log('API: 全レコードテスト結果:', { 
          records: allData, 
          recordCount: allData?.length || 0,
          error: allError 
        });
      } catch (testErr) {
        console.error('API: RLSテストエラー:', testErr);
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// 会議議事録の登録API
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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
    
    // 必須フィールドの検証
    if (!body.meeting_type_id || !body.title || !body.meeting_date) {
      return NextResponse.json({ error: '必須フィールドが不足しています' }, { status: 400 });
    }

    // プロファイルの取得（施設IDの確認用）
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profileData) {
      console.error('API: プロファイル取得エラー:', profileError);
      return NextResponse.json({ error: 'ユーザープロファイルが見つかりません' }, { status: 404 });
    }

    // 保存データの準備
    const newRecord: Partial<MeetingMinute> = {
      meeting_type_id: body.meeting_type_id,
      title: body.title,
      meeting_date: body.meeting_date,
      recorded_by: session.user.id,
      facility_id: profileData.facility_id,
      department_id: body.department_id,
      attendees: body.attendees || [],
      content: body.content || '',
      summary: body.summary || '',
      keywords: body.keywords || [],
      is_transcribed: !!body.is_transcribed,
      audio_file_path: body.audio_file_path || null
    };

    // JSONデータ（speakersとsegments）があれば追加
    if (body.speakers) {
      try {
        // すでにJSON文字列ならそのまま、オブジェクトならJSON文字列に変換
        newRecord.speakers = typeof body.speakers === 'string' 
          ? body.speakers 
          : JSON.stringify(body.speakers);
        console.log('API: speakers列を設定:', typeof newRecord.speakers);
      } catch (err) {
        console.error('API: speakers列の処理エラー:', err);
      }
    }

    if (body.segments) {
      try {
        // すでにJSON文字列ならそのまま、オブジェクトならJSON文字列に変換
        newRecord.segments = typeof body.segments === 'string' 
          ? body.segments 
          : JSON.stringify(body.segments);
        console.log('API: segments列を設定:', typeof newRecord.segments);
      } catch (err) {
        console.error('API: segments列の処理エラー:', err);
      }
    }

    // データの保存を実行する前にデータの内容をログ出力
    console.log('API: 保存するデータのフィールド:', Object.keys(newRecord));
    console.log('API: facilitiy_id:', newRecord.facility_id);

    // データの保存
    const { data, error } = await supabase
      .from('meeting_minutes')
      .insert(newRecord)
      .select();

    if (error) {
      console.error('API: データ保存エラー:', error);
      // より詳細なエラー情報を返す
      return NextResponse.json({
        error: 'データ保存中にエラーが発生しました',
        details: error,
        data: newRecord
      }, { status: 500 });
    }

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
} 
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { fileName: string } }
) {
  try {
    console.log('GET audio file request received');
    
    // Supabaseクライアントの初期化
    const supabasePromise = createClient();
    const supabase = await supabasePromise;
    
    // セッション確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('認証エラー:', sessionError);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    
    // ユーザープロファイルから施設IDを取得
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', session.user.id)
      .single();
      
    if (profileError || !profileData?.facility_id) {
      console.error('施設IDの取得エラー:', profileError);
      return NextResponse.json({ error: '施設情報が取得できません' }, { status: 403 });
    }
    
    const facilityId = profileData.facility_id;
    console.log('ユーザー施設ID:', facilityId);
    
    // Next.js 15のパラメータ処理に対応
    // paramsがPromiseオブジェクトとして扱われるようになったため、resolvedParamsを作成
    const fileName = decodeURIComponent(params.fileName);
    console.log('Requested audio file (decoded):', fileName);
    
    // 適切なパスの構築
    let filePath = fileName;
    const hasMeetingRecordingsPrefix = fileName.startsWith('meeting_recordings/');
    const hasFacilityIdPrefix = fileName.includes(`meeting_recordings/${facilityId}/`);
    
    // デバッグ情報
    console.log('Path analysis:', {
      originalFileName: fileName,
      hasMeetingRecordingsPrefix,
      hasFacilityIdPrefix,
      facilityId
    });
    
    // 適切なパスを構築
    if (!hasMeetingRecordingsPrefix) {
      // プレフィックスがない場合は施設IDを含むパスを作成
      filePath = `meeting_recordings/${facilityId}/${fileName}`;
      console.log('Adding complete prefix - New path:', filePath);
    } else if (!hasFacilityIdPrefix) {
      // meeting_recordingsはあるが施設IDがない場合、施設IDを追加
      filePath = fileName.replace('meeting_recordings/', `meeting_recordings/${facilityId}/`);
      console.log('Adding facility ID to path - New path:', filePath);
    } else {
      // 既に適切なパスを持っている
      console.log('Path already has proper structure - Using original path:', filePath);
    }
    
    console.log('Final storage path:', filePath);
    
    // ファイルのURLを取得
    const { data, error } = await supabase
      .storage
      .from('minutesaudio')
      .createSignedUrl(filePath, 60);
      
    if (error || !data?.signedUrl) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json(
        { error: 'ファイルURLの作成に失敗しました' },
        { status: 500 }
      );
    }
    
    console.log('Audio URL created:', data.signedUrl);
    
    // 直接ファイルを取得して返却
    const fileResponse = await fetch(data.signedUrl);
    if (!fileResponse.ok) {
      console.error('Error fetching audio file:', fileResponse.statusText);
      return NextResponse.json(
        { error: 'ファイルの取得に失敗しました' },
        { status: 500 }
      );
    }
    
    const audioData = await fileResponse.arrayBuffer();
    const headers = new Headers();
    headers.set('Content-Type', 'audio/wav');
    
    console.log('Successfully retrieved audio file');
    return new NextResponse(audioData, {
      status: 200,
      headers
    });
    
  } catch (error) {
    console.error('Unexpected error in audio file route:', error);
    return NextResponse.json(
      { error: '音声ファイルの取得中にエラーが発生しました' },
      { status: 500 }
    );
  }
} 
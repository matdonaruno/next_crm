import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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
    
    // ユーザーの施設IDを取得
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', session.user.id)
      .single();
      
    if (profileError || !profileData?.facility_id) {
      console.error('施設ID取得エラー:', profileError);
      return NextResponse.json(
        { error: '施設情報が取得できません' },
        { status: 403 }
      );
    }
    
    const facilityId = profileData.facility_id;
    console.log('アップロード用の施設ID:', facilityId);
    
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
      facilityId
    });
    
    console.log('minutesaudio バケットが存在すると仮定して処理を続行します');
    
    // ファイル名の生成（一意性を確保）- 施設IDを含むパスを使用
    const fileExt = file.name.split('.').pop();
    const fileName = `meeting_recordings/${facilityId}/${Date.now()}.${fileExt}`;
    
    console.log('生成したファイルパス:', fileName);
    
    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    
    // Supabaseへのアップロード
    const { data, error } = await supabase.storage
      .from('minutesaudio')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        cacheControl: "3600",
      });
    
    if (error) {
      console.error('Supabaseアップロードエラー:', error);
      
      // エラーの種類に応じてメッセージを変更
      if (error.message.includes('security policy')) {
        return NextResponse.json(
          { error: 'アップロード権限がありません' },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { error: `ファイルのアップロードに失敗しました: ${error.message}` },
        { status: 500 }
      );
    }
    
    // 成功レスポンス
    return NextResponse.json({
      success: true,
      path: fileName, // 施設IDを含むパスを返す
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
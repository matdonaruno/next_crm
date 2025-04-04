import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// POST: ユーザープロファイルを作成/更新する
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    const profileData = await request.json();
    
    if (!profileData || !profileData.id) {
      return NextResponse.json({ error: 'プロファイルデータとユーザーIDは必須です' }, { status: 400 });
    }
    
    console.log('API Endpoint: /api/user/create-profile 受信データ:', profileData); // 受信データをログ記録
    
    // ユーザー認証を確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('プロファイル作成: 認証エラー:', authError);
      return NextResponse.json({ error: '認証されていません' }, { status: 401 });
    }
    
    // 自分自身のプロファイルのみ作成/更新可能
    if (user.id !== profileData.id) {
      console.error('プロファイル作成: 権限エラー - ユーザーID不一致', { userId: user.id, profileId: profileData.id });
      return NextResponse.json({ error: '他のユーザーのプロファイルは更新できません' }, { status: 403 });
    }
    
    // プロファイルデータを構築
    const cleanProfileData = {
      id: profileData.id,
      fullname: profileData.fullname || null,
      email: profileData.email || user.email,
      facility_id: profileData.facility_id || null,
      // department_id: profileData.department_id || null, // ここがコメントアウトされているか削除されていることを確認
      role: profileData.role || 'regular_user',
      is_active: profileData.is_active !== undefined ? profileData.is_active : true,
      updated_at: new Date().toISOString(),
      // created_at もコメントアウトされていることを確認
    };
    
    console.log('API Endpoint: upsertに渡すデータ:', cleanProfileData); // upsert前のデータをログ記録
    
    // バリデーション: 必須フィールドのチェック
    if (!cleanProfileData.id || !cleanProfileData.email || !cleanProfileData.role) {
      console.error('プロファイル作成: 必須フィールドが不足しています:', {
        hasId: !!cleanProfileData.id,
        hasEmail: !!cleanProfileData.email,
        hasRole: !!cleanProfileData.role
      });
      return NextResponse.json({ 
        error: '必須フィールド（id, email, role）が不足しています',
        details: {
          id: !cleanProfileData.id ? '必須' : undefined,
          email: !cleanProfileData.email ? '必須' : undefined,
          role: !cleanProfileData.role ? '必須' : undefined
        }
      }, { status: 400 });
    }
    
    console.log('プロファイル作成/更新:', cleanProfileData);
    
    // まず直接profilesテーブルに存在するかチェック
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', cleanProfileData.id)
      .maybeSingle();
    
    console.log('既存プロファイルチェック結果:', { 
      exists: !!existingProfile, 
      error: checkError ? `${checkError.code}: ${checkError.message}` : 'なし',
      profile: existingProfile
    });
    
    // プロファイルが存在するか存在しないかに基づいて処理を分岐
    if (existingProfile) {
      // 既存プロファイルの更新
      console.log('既存プロファイルを更新します');
      const { data: updatedData, error: updateError } = await supabase
        .from('profiles')
        .update(cleanProfileData)
        .eq('id', cleanProfileData.id)
        .select('*')
        .single();
      
      if (updateError) {
        console.error('プロファイル更新エラー:', updateError);
        return NextResponse.json({ 
          error: 'プロファイルの更新に失敗しました', 
          details: updateError,
          code: updateError.code
        }, { status: 500 });
      }
      
      console.log('プロファイル更新成功:', updatedData);
      return NextResponse.json(updatedData);
    } else {
      // 新規プロファイルの作成
      console.log('新規プロファイルを作成します');
      const { data: insertData, error: insertError } = await supabase
        .from('profiles')
        .insert(cleanProfileData)
        .select('*')
        .single();
      
      if (insertError) {
        console.error('プロファイル作成エラー:', insertError);
        return NextResponse.json({ 
          error: 'プロファイルの作成に失敗しました', 
          details: insertError,
          code: insertError.code
        }, { status: 500 });
      }
      
      console.log('プロファイル作成成功:', insertData);
      return NextResponse.json(insertData);
    }
  } catch (error: any) { // catchで型を指定
    console.error('API処理中の予期せぬ例外:', error); // 例外全体をログ記録
    // エラーオブジェクトが持つ可能性のあるプロパティをログに出力
    console.error('例外詳細:', { 
        message: error.message, 
        stack: error.stack, 
        name: error.name 
        // 他に有用なプロパティがあれば追加
    });
    return NextResponse.json(
      { error: '内部サーバーエラー', message: error.message },
      { status: 500 }
    );
  }
} 
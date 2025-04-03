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
    
    // サービスロールキーを用いて管理者クライアントを作成
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (!supabaseServiceRole || !supabaseUrl) {
      console.error('プロファイル作成: サービスロールキーが見つかりません');
      return NextResponse.json({ 
        error: 'サーバー設定が正しくありません。管理者に連絡してください。' 
      }, { status: 500 });
    }
    
    // 管理者権限のクライアントを作成
    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      supabaseServiceRole
    );
    
    // プロファイルデータを整形
    const cleanProfileData = {
      id: profileData.id,
      fullname: profileData.fullname || null,
      email: profileData.email || user.email,
      facility_id: profileData.facility_id || null,
      department_id: profileData.department_id || null,
      role: profileData.role || 'regular_user',
      is_active: true,
      updated_at: new Date().toISOString(),
      created_at: profileData.created_at || new Date().toISOString()
    };
    
    console.log('プロファイル作成/更新:', cleanProfileData);
    
    // まず直接profilesテーブルに存在するかチェック
    const { data: existingProfile, error: checkError } = await supabaseAdmin
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
      const { data: updatedData, error: updateError } = await supabaseAdmin
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
      try {
        // ここでSQLクエリを直接実行する代替手段を試す
        const { data: insertData, error: insertError } = await supabaseAdmin
          .from('profiles')
          .insert(cleanProfileData)
          .select('*')
          .single();
        
        if (insertError) {
          console.error('プロファイル挿入エラー (1):', insertError);
          
          // 別の方法を試す - RLSをバイパスするためのサービスロールを使用
          console.log('別の方法でプロファイル作成を試みます');
          
          // 直接SQLを使用
          const { data: rawSqlData, error: rawSqlError } = await supabaseAdmin.rpc(
            'insert_profile_admin',
            { 
              p_id: cleanProfileData.id,
              p_fullname: cleanProfileData.fullname,
              p_email: cleanProfileData.email,
              p_facility_id: cleanProfileData.facility_id,
              p_department_id: cleanProfileData.department_id,
              p_role: cleanProfileData.role,
              p_is_active: true
            }
          );
          
          console.log('RPC プロファイル作成結果:', { 
            success: !!rawSqlData, 
            error: rawSqlError ? `${rawSqlError.code}: ${rawSqlError.message}` : 'なし', 
            data: rawSqlData 
          });
          
          if (rawSqlError) {
            return NextResponse.json({ 
              error: 'どの方法でもプロファイルの作成に失敗しました', 
              details: {
                insert: insertError,
                rpc: rawSqlError
              }
            }, { status: 500 });
          }
          
          // 作成後に再取得
          const { data: fetchedProfile } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', cleanProfileData.id)
            .single();
          
          return NextResponse.json(fetchedProfile || { id: cleanProfileData.id, created: true });
        }
        
        console.log('プロファイル作成成功:', insertData);
        return NextResponse.json(insertData);
      } catch (insertCatchError) {
        console.error('プロファイル作成中に例外発生:', insertCatchError);
        return NextResponse.json({ 
          error: 'プロファイル作成中に例外が発生しました', 
          details: insertCatchError instanceof Error ? insertCatchError.message : String(insertCatchError)
        }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('プロファイル作成処理エラー:', error);
    return NextResponse.json({ 
      error: 'プロファイル作成中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
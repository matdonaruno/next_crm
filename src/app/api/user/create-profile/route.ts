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
      updated_at: new Date().toISOString(),
      created_at: profileData.created_at || new Date().toISOString()
    };
    
    console.log('プロファイル作成/更新:', cleanProfileData);
    
    // まずはupsertを試す
    const { data, error: upsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(cleanProfileData)
      .select('*')
      .single();
    
    if (upsertError) {
      console.error('プロファイルupsertエラー、insertを試みます:', upsertError);
      
      // upsertに失敗した場合はinsertを試す
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(cleanProfileData)
        .select('*')
        .single();
      
      if (insertError) {
        console.error('プロファイルinsertエラー:', insertError);
        return NextResponse.json({ 
          error: 'プロファイルの作成に失敗しました', 
          details: insertError 
        }, { status: 500 });
      }
      
      console.log('プロファイル作成成功:', insertData);
      return NextResponse.json(insertData);
    }
    
    console.log('プロファイル更新成功:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('プロファイル作成処理エラー:', error);
    return NextResponse.json({ 
      error: 'プロファイル作成中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
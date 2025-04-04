import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// GET: 招待トークンの検証
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    
    // URLからトークンを取得
    const token = request.nextUrl.searchParams.get('token');
    
    if (!token) {
      return NextResponse.json({ error: '招待トークンが必要です' }, { status: 400 });
    }
    
    console.log('招待トークン検証:', token);
    
    // トークンの有効性を確認
    const { data, error } = await supabase
      .from('user_invitations')
      .select('*, facilities(name), departments(name)')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    console.log('検証結果:', { hasData: !!data, error });
    
    if (error || !data) {
      return NextResponse.json({ 
        error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。' 
      }, { status: 400 });
    }
    
    // トークンが有効な場合、招待情報を返す
    return NextResponse.json({
      valid: true,
      invitation: {
        email: data.email,
        role: data.role,
        facility: data.facilities?.name,
        department: data.departments?.name,
        expires_at: data.expires_at,
        facility_id: data.facility_id,
        department_id: data.department_id
      }
    });
    
  } catch (error) {
    console.error('招待トークン検証エラー:', error);
    return NextResponse.json({ error: '招待トークンの検証中にエラーが発生しました' }, { status: 500 });
  }
}

// POST: 招待の受諾と新規ユーザー登録
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    const { token, password, fullName } = await request.json();
    
    if (!token || !password) {
      return NextResponse.json({ error: 'トークンとパスワードは必須です' }, { status: 400 });
    }
    
    console.log('受信したトークン:', token);
    
    // トークンの有効性を確認
    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (invitationError || !invitation) {
      console.error('招待検証エラー:', invitationError);
      return NextResponse.json({ 
        error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。' 
      }, { status: 400 });
    }
    
    // 既存のユーザーを確認（メールアドレスで検索）
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (!supabaseServiceRole || !supabaseUrl) {
      console.error('Supabase service role key missing');
      return NextResponse.json({ 
        error: 'サーバー設定が正しくありません。管理者に連絡してください。' 
      }, { status: 500 });
    }
    
    // サービスロールクライアントを作成
    const supabaseAdmin = createSupabaseClient(
      supabaseUrl,
      supabaseServiceRole
    );
    
    // 既存ユーザーを確認
    let existingUser = null;
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (!error && users) {
        existingUser = users.find(user => user.email === invitation.email);
      }
      if (existingUser) {
        console.log('既存ユーザーを発見:', existingUser.id);
      }
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
      // エラーの場合は新規ユーザーとして処理を続行
    }
    
    let userId;
    
    if (existingUser) {
      // 既存ユーザーの場合はパスワードを更新
      console.log('既存ユーザーを更新:', existingUser.id);
      try {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password }
        );
        
        if (updateError) {
          console.error('パスワード更新エラー:', updateError);
          return NextResponse.json({ 
            error: 'パスワードの更新に失敗しました', 
            details: updateError 
          }, { status: 500 });
        }
        
        userId = existingUser.id;
        
        // プロフィール情報を更新
        console.log('既存ユーザーのプロフィール情報を更新:', { userId, fullName });
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({
            fullname: fullName,
            role: invitation.role,
            facility_id: invitation.facility_id,
            email: invitation.email,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
        
        if (profileError) {
          console.error('プロフィール更新エラー:', profileError);
          // プロフィール更新に失敗してもユーザー登録自体は成功とする
        } else {
          console.log('既存ユーザーのプロフィール更新が完了');
        }
      } catch (error) {
        console.error('ユーザー更新処理エラー:', error);
        return NextResponse.json({ 
          error: 'ユーザー情報の更新中にエラーが発生しました',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    } else {
      // 新規ユーザー登録
      try {
        console.log('新規ユーザー登録を実行:', { email: invitation.email });
        
        // サービスロールを使用して管理者APIから直接ユーザーを作成
        const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: invitation.email,
          password: password,
          email_confirm: true, // メール確認済みとしてマーク
          user_metadata: {
            full_name: fullName || invitation.email.split('@')[0],
            role: invitation.role,
            facility_id: invitation.facility_id,
            invited_by: invitation.invited_by,
            facility_name: invitation.facility_name
          }
        });
        
        if (createUserError || !userData.user) {
          console.error('ユーザー登録エラー:', createUserError);
          return NextResponse.json({ 
            error: 'ユーザー登録に失敗しました', 
            details: createUserError 
          }, { status: 500 });
        }
        
        userId = userData.user.id;
        console.log('新規ユーザー登録が完了:', userId);
        
        // 新規ユーザーのプロフィール情報を明示的に更新
        // user_metadataに情報を保存しても、profilesテーブルには自動では反映されないため
        console.log('新規ユーザーのプロフィール情報を更新:', { userId, fullName });
        const profileData = {
          id: userId,
          fullname: fullName,
          role: invitation.role,
          facility_id: invitation.facility_id,
          email: invitation.email,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        // まずはupsertを試す - 管理者権限でプロファイルを作成
        const { error: upsertError } = await supabaseAdmin
          .from('profiles')
          .upsert(profileData);
        
        if (upsertError) {
          console.warn('プロフィールupsertエラー、insertを試みます:', upsertError);
          
          // upsertに失敗した場合はinsertを試す - 管理者権限で
          const { error: insertError } = await supabaseAdmin
            .from('profiles')
            .insert(profileData);
          
          if (insertError) {
            console.error('新規ユーザーのプロフィール挿入エラー:', insertError);
            // プロフィール更新に失敗してもユーザー登録自体は成功とする
          } else {
            console.log('新規ユーザーのプロフィール挿入が完了');
          }
        } else {
          console.log('新規ユーザーのプロフィール更新が完了');
        }
      } catch (error) {
        console.error('ユーザー登録処理エラー:', error);
        return NextResponse.json({ 
          error: 'ユーザー登録処理中にエラーが発生しました',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    }
    
    // 招待を使用済みにマーク
    try {
      const { error: updateError } = await supabase
        .from('user_invitations')
        .update({ 
          is_used: true,
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);
        
      if (updateError) {
        console.error('招待使用済み更新エラー:', updateError);
        // 招待更新エラーはユーザー作成の成功に影響させない
      }
    } catch (error) {
      console.error('招待更新エラー:', error);
      // 招待更新エラーはユーザー作成の成功に影響させない
    }
    
    // アクティビティログを記録
    try {
      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        action_type: 'user_registration_completed',
        action_details: { 
          invitation_id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          is_existing_user: !!existingUser
        },
        performed_by: userId
      });
      
      console.log('アクティビティログ記録完了');
    } catch (logError) {
      console.error('アクティビティログ記録エラー:', logError);
      // ログ記録失敗はユーザー登録に影響しないように処理を続行
    }
    
    // 招待した管理者に通知
    try {
      if (invitation.invited_by) {
        await supabase.from('user_notifications').insert({
          user_id: invitation.invited_by,
          title: 'ユーザー登録完了',
          message: `${fullName || invitation.email}さんが招待を受け入れ、アカウントを作成しました。`,
          notification_type: 'user_registration',
          related_data: {
            user_id: userId,
            email: invitation.email
          }
        });
        
        console.log('管理者通知記録完了');
      }
    } catch (notifyError) {
      console.error('通知作成エラー:', notifyError);
      // 通知失敗はユーザー登録に影響しないように処理を続行
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'アカウント作成が完了しました。ログインしてください。',
      isExistingUser: !!existingUser
    });
    
  } catch (error) {
    console.error('ユーザー登録エラー:', error);
    return NextResponse.json({ 
      error: 'ユーザー登録中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
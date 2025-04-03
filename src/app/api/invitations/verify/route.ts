import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// GET: 招待トークンの検証
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    
    // URLからトークンを取得
    const token = request.nextUrl.searchParams.get('token');
    
    if (!token) {
      return NextResponse.json({ error: '招待トークンが必要です' }, { status: 400 });
    }
    
    // トークンの有効性を確認
    const { data, error } = await supabase
      .from('user_invitations')
      .select('*, facilities(name), departments(name)')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
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
        error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。', 
        details: invitationError
      }, { status: 400 });
    }
    
    // 既存のユーザーを確認（メールアドレスで検索）
    let existingUser = null;
    try {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (!error && data && data.users) {
        existingUser = data.users.find(user => user.email === invitation.email);
      }
      if (existingUser) {
        console.log('既存ユーザーを発見:', existingUser.id);
      }
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
    }
    
    let userId;
    
    if (existingUser) {
      // 既存ユーザーの場合はパスワードを更新
      console.log('既存ユーザーを更新:', existingUser.id);
      const { error: updateError } = await supabase.auth.admin.updateUserById(
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
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          role: invitation.role,
          facility_id: invitation.facility_id,
          department_id: invitation.department_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (profileError) {
        console.error('プロフィール更新エラー:', profileError);
        // プロフィール更新に失敗してもユーザー登録自体は成功とする
      }
    } else {
      // 新規ユーザー登録
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: {
            full_name: fullName || invitation.email.split('@')[0],
            role: invitation.role,
            facility_id: invitation.facility_id,
            department_id: invitation.department_id
          }
        }
      });
      
      if (signUpError || !authData.user) {
        console.error('ユーザー登録エラー:', signUpError);
        return NextResponse.json({ 
          error: 'ユーザー登録に失敗しました', 
          details: signUpError 
        }, { status: 500 });
      }
      
      userId = authData.user.id;
    }
    
    // 招待を使用済みにマーク
    await supabase
      .from('user_invitations')
      .update({ 
        is_used: true,
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);
    
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
    } catch (logError) {
      console.error('アクティビティログ記録エラー:', logError);
      // ログ記録失敗はユーザー登録に影響しないように処理を続行
    }
    
    // 招待した管理者に通知
    try {
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
    } catch (notifyError) {
      console.error('通知作成エラー:', notifyError);
      // 通知失敗はユーザー登録に影響しないように処理を続行
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'アカウント作成が完了しました。ログインしてください。' 
    });
    
  } catch (error) {
    console.error('ユーザー登録エラー:', error);
    return NextResponse.json({ 
      error: 'ユーザー登録中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
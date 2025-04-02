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
    
    // 対応するユーザーがSupabaseに存在するかを確認
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    const existingUser = userData?.users?.find(user => user.email === data.email);
    
    if (!existingUser) {
      return NextResponse.json({ 
        error: 'このメールアドレスに対応するユーザーが見つかりません。管理者に連絡してください。' 
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
        user_id: existingUser.id
      }
    });
    
  } catch (error) {
    console.error('招待トークン検証エラー:', error);
    return NextResponse.json({ error: '招待トークンの検証中にエラーが発生しました' }, { status: 500 });
  }
}

// POST: 招待の受諾とユーザーアカウントの完成
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    const { token, password, fullName, userId } = await request.json();
    
    if (!token || !password || !userId) {
      return NextResponse.json({ error: 'トークン、パスワード、ユーザーIDは必須です' }, { status: 400 });
    }
    
    // トークンの有効性を確認
    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (invitationError || !invitation) {
      return NextResponse.json({ 
        error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。' 
      }, { status: 400 });
    }
    
    // ユーザーのパスワードを設定
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: password,
      user_metadata: {
        full_name: fullName || invitation.email.split('@')[0],
        role: invitation.role,
        facility_id: invitation.facility_id,
        department_id: invitation.department_id
      }
    });
    
    if (updateError) {
      return NextResponse.json({ error: 'ユーザー情報の更新に失敗しました', details: updateError }, { status: 500 });
    }
    
    // プロフィールテーブルも更新
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName || invitation.email.split('@')[0],
        role: invitation.role,
        facility_id: invitation.facility_id,
        department_id: invitation.department_id
      })
      .eq('id', userId);
    
    if (profileError) {
      console.error('プロフィール更新エラー:', profileError);
      // プロフィール更新エラーは致命的ではないのでエラーは返さない
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
    await supabase.from('user_activity_logs').insert({
      user_id: userId,
      action_type: 'user_registration_completed',
      action_details: { 
        invitation_id: invitation.id,
        email: invitation.email,
        role: invitation.role
      },
      performed_by: userId
    });
    
    // 招待した管理者に通知
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
    
    return NextResponse.json({ 
      success: true, 
      message: 'アカウント設定が完了しました。ログインしてください。' 
    });
    
  } catch (error) {
    console.error('ユーザー登録エラー:', error);
    return NextResponse.json({ 
      error: 'ユーザー登録中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// GET: 招待トークンの検証
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    
    // URLからトークンを取得し、不要な文字を除去
    const rawToken = request.nextUrl.searchParams.get('token');
    const token = rawToken ? rawToken.split('#')[0].split('?')[0].trim() : null;
    
    console.log('招待トークン検証リクエスト:', { rawToken, cleanedToken: token });
    
    if (!token) {
      return NextResponse.json({ error: '招待トークンが必要です' }, { status: 400 });
    }
    
    // トークンの有効性を確認 - クエリフィルターを修正
    const { data, error } = await supabase
      .from('user_invitations')
      .select('*, facilities(name), departments(name)')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    console.log('検証結果:', { hasData: !!data, error, token });
    
    if (error || !data) {
      console.log('標準検証に失敗、ストアド関数を試行');
      
      // バックアップの検証方法として直接SQLクエリも試す
      const { data: sqlData, error: sqlError } = await supabase.rpc(
        'check_invitation_token',
        { token_param: token }
      );
      
      console.log('SQLバックアップ検証:', { hasData: !!sqlData, error: sqlError, token });
      
      if (sqlError || !sqlData) {
        return NextResponse.json({ 
          error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。',
          details: error,
          token: token.substring(0, 8) + '...' // セキュリティのため一部のみ表示
        }, { status: 400 });
      }
      
      // SQLクエリが成功した場合の処理
      return NextResponse.json({
        valid: true,
        invitation: sqlData,
        method: 'sql'
      });
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
      },
      method: 'api'
    });
    
  } catch (error) {
    console.error('招待トークン検証エラー:', error);
    return NextResponse.json({ 
      error: '招待トークンの検証中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// POST: 招待の受諾と新規ユーザー登録
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(cookies());
    const requestBody = await request.json();
    const { token: rawToken, password, fullName } = requestBody;
    
    // トークンから不要な文字を除去
    const token = rawToken ? rawToken.split('#')[0].split('?')[0].trim() : null;
    
    console.log('登録処理：受信したトークン情報:', { 
      hasToken: !!token, 
      tokenLength: token?.length,
      hasPassword: !!password,
      hasFullName: !!fullName
    });
    
    if (!token || !password) {
      return NextResponse.json({ error: 'トークンとパスワードは必須です' }, { status: 400 });
    }
    
    // トークンの有効性を確認
    let invitation;
    const { data, error: invitationError } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    invitation = data;
    
    console.log('招待検証結果:', { hasData: !!invitation, error: invitationError });
    
    if (invitationError || !invitation) {
      console.log('標準検証に失敗、ストアド関数を試行');
      
      // バックアップの検証方法として直接SQLクエリも試す
      const { data: sqlData, error: sqlError } = await supabase.rpc(
        'check_invitation_token',
        { token_param: token }
      );
      
      console.log('SQLバックアップ検証:', { hasData: !!sqlData, error: sqlError });
      
      if (sqlError || !sqlData) {
        console.error('招待検証エラー:', invitationError);
        return NextResponse.json({ 
          error: '無効な招待トークンです。期限切れか、既に使用済みの可能性があります。', 
          details: invitationError,
          tokenHint: token.substring(0, 8) + '...' // セキュリティのため一部のみ表示
        }, { status: 400 });
      }
      
      // SQLクエリが成功した場合、招待情報を使用
      invitation = sqlData;
      console.log('ストアド関数による検証成功');
    }

    // 既存のユーザーを確認（メールアドレスで検索）
    let existingUser = null;
    try {
      const { data: userData, error } = await supabase.auth.admin.listUsers();
      if (!error && userData && userData.users) {
        existingUser = userData.users.find(user => user.email === invitation.email);
      }
      if (existingUser) {
        console.log('既存ユーザーを発見:', { id: existingUser.id, email: existingUser.email });
      }
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
    }
    
    let userId;
    
    if (existingUser) {
      // 既存ユーザーの場合はパスワードを更新
      console.log('既存ユーザーを更新:', existingUser.id);
      
      try {
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
        
        console.log('既存ユーザー情報の更新が完了');
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
        console.log('新規ユーザー登録が完了:', userId);
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
      if (invitation.id) {
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
      } else {
        console.log('招待IDが見つからないため更新をスキップ');
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
          invitation_token: token.substring(0, 8) + '...', // セキュリティのため一部のみ
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
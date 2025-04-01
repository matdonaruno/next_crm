import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';

// メールアドレスの厳密な検証
function isValidEmail(email: string): boolean {
  // RFC 5322準拠のより厳密なメールアドレス検証
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

// メール送信制限の設定
const INVITE_LIMITS = {
  // 1時間あたりの最大招待数
  HOURLY_LIMIT: 10,
  // 1日あたりの最大招待数
  DAILY_LIMIT: 30,
  // 月間の最大招待数
  MONTHLY_LIMIT: 200,
  // 施設ごとの1日あたりの最大招待数
  FACILITY_DAILY_LIMIT: 50
};

// 時間制限をチェック
async function checkRateLimit(
  supabase: any, 
  userId: string, 
  facilityId: string
): Promise<{ allowed: boolean; error?: string }> {
  const now = new Date();
  
  // 1時間前のタイムスタンプ
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  
  // 24時間前のタイムスタンプ
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  
  // 30日前のタイムスタンプ
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // ユーザーの時間ごとの招待数を確認
  const { count: hourlyCount, error: hourlyError } = await supabase
    .from('user_activity_logs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('action_type', 'user_invitation_sent')
    .gte('created_at', oneHourAgo);
  
  if (hourlyError) {
    console.error('時間別レート制限チェックエラー:', hourlyError);
    return { allowed: false, error: '招待制限チェック中にエラーが発生しました' };
  }
  
  if (hourlyCount >= INVITE_LIMITS.HOURLY_LIMIT) {
    return { 
      allowed: false, 
      error: `時間あたりの招待制限(${INVITE_LIMITS.HOURLY_LIMIT}件)に達しました。1時間後に再試行してください。`
    };
  }
  
  // ユーザーの日ごとの招待数を確認
  const { count: dailyCount, error: dailyError } = await supabase
    .from('user_activity_logs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('action_type', 'user_invitation_sent')
    .gte('created_at', oneDayAgo);
  
  if (dailyError) {
    console.error('日別レート制限チェックエラー:', dailyError);
    return { allowed: false, error: '招待制限チェック中にエラーが発生しました' };
  }
  
  if (dailyCount >= INVITE_LIMITS.DAILY_LIMIT) {
    return { 
      allowed: false, 
      error: `1日あたりの招待制限(${INVITE_LIMITS.DAILY_LIMIT}件)に達しました。24時間後に再試行してください。`
    };
  }
  
  // ユーザーの月間招待数を確認
  const { count: monthlyCount, error: monthlyError } = await supabase
    .from('user_activity_logs')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('action_type', 'user_invitation_sent')
    .gte('created_at', thirtyDaysAgo);
  
  if (monthlyError) {
    console.error('月間レート制限チェックエラー:', monthlyError);
    return { allowed: false, error: '招待制限チェック中にエラーが発生しました' };
  }
  
  if (monthlyCount >= INVITE_LIMITS.MONTHLY_LIMIT) {
    return { 
      allowed: false, 
      error: `月間招待制限(${INVITE_LIMITS.MONTHLY_LIMIT}件)に達しました。管理者に連絡してください。`
    };
  }
  
  // 施設ごとの日間制限をチェック
  const { count: facilityDailyCount, error: facilityError } = await supabase
    .from('user_activity_logs')
    .select('id', { count: 'exact' })
    .eq('action_type', 'user_invitation_sent')
    .gte('created_at', oneDayAgo)
    .contains('action_details', { facility_id: facilityId });
  
  if (facilityError) {
    console.error('施設別レート制限チェックエラー:', facilityError);
    return { allowed: false, error: '招待制限チェック中にエラーが発生しました' };
  }
  
  if (facilityDailyCount >= INVITE_LIMITS.FACILITY_DAILY_LIMIT) {
    return { 
      allowed: false, 
      error: `この施設の1日あたりの招待制限(${INVITE_LIMITS.FACILITY_DAILY_LIMIT}件)に達しました。24時間後に再試行してください。`
    };
  }
  
  return { allowed: true };
}

export async function GET(
  request: NextRequest, 
  { params }: { params: { email: string } }
) {
  try {
    // 認証確認
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const currentUserId = session.user.id;
    const { email } = params;
    
    if (!email) {
      return NextResponse.json({ error: 'メールアドレスは必須です' }, { status: 400 });
    }

    // メールアドレスの形式を検証
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: '無効なメールアドレス形式です' }, { status: 400 });
    }

    // 招待者の権限を確認
    const { data: inviterProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, facility_id, full_name, username')
      .eq('id', currentUserId)
      .single();
    
    if (profileError || !inviterProfile) {
      return NextResponse.json({ error: 'プロフィール情報の取得に失敗しました' }, { status: 500 });
    }
    
    // 招待者が管理者権限を持っているか確認
    if (inviterProfile.role !== 'superuser' && inviterProfile.role !== 'facility_admin') {
      return NextResponse.json({ error: 'ユーザー招待権限がありません' }, { status: 403 });
    }

    // 施設IDを取得
    const facilityId = inviterProfile.facility_id;
    if (!facilityId) {
      return NextResponse.json({ error: '招待者に施設IDが設定されていません' }, { status: 400 });
    }

    // レート制限をチェック
    const rateLimitCheck = await checkRateLimit(supabase, currentUserId, facilityId);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json({ error: rateLimitCheck.error }, { status: 429 }); // 429: Too Many Requests
    }

    // 既存の招待を確認
    const { data: existingInvitation, error: existingError } = await supabase
      .from('user_invitations')
      .select('id, created_at')
      .eq('email', email)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (existingError) {
      console.error('既存招待確認エラー:', existingError);
    } else if (existingInvitation) {
      const invitationDate = new Date(existingInvitation.created_at);
      const daysSinceInvitation = Math.floor((Date.now() - invitationDate.getTime()) / (1000 * 3600 * 24));
      
      if (daysSinceInvitation < 7) {
        return NextResponse.json({ 
          error: `このユーザーには既に招待メールが送信されています (${daysSinceInvitation}日前)` 
        }, { status: 400 });
      }
    }

    // 招待トークンを生成（UUID + タイムスタンプ）
    const token = `${uuidv4()}-${Date.now()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7日間有効

    // デフォルトロールを設定（通常は一般ユーザー）
    const role = 'user';

    // 招待レコードをDBに保存
    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .insert({
        email,
        invited_by: currentUserId,
        facility_id: facilityId,
        department_id: null, // 必要に応じて追加
        role,
        invitation_token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
    
    if (invitationError) {
      // 既に招待メールが送信済みの場合
      if (invitationError.code === '23505') { // unique violation
        return NextResponse.json({ error: 'このメールアドレスには既に招待を送信済みです' }, { status: 400 });
      }
      return NextResponse.json({ error: '招待の作成に失敗しました', details: invitationError }, { status: 500 });
    }

    // 施設名を取得
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facilityId)
      .single();
    
    // Supabaseのservice_roleを使用してクライアントを作成
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;
    
    if (!supabaseUrl || !supabaseServiceRole) {
      return NextResponse.json({ error: 'Supabase環境変数が設定されていません' }, { status: 500 });
    }
    
    // service_roleを使用したクライアントを作成
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);
    
    // ユーザーを招待
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/register?token=${token}`,
      data: {
        invited_by: inviterProfile.full_name || inviterProfile.username || '管理者',
        role: role,
        facility_name: facility?.name || '医療施設',
        token: token // カスタムメタデータとしてトークンを保存
      }
    });
    
    if (error) {
      // メール送信に失敗した場合は招待レコードを削除
      await supabase.from('user_invitations').delete().eq('id', invitation.id);
      console.error('ユーザー招待エラー:', error);
      return NextResponse.json({ error: error.message }, { status: error.status || 500 });
    }
    
    // アクティビティログを記録
    await supabase.from('user_activity_logs').insert({
      user_id: currentUserId,
      action_type: 'user_invitation_sent',
      action_details: { 
        invited_email: email, 
        role, 
        facility_id: facilityId,
        invitation_id: invitation.id
      },
      performed_by: currentUserId
    });
    
    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    console.error('招待処理エラー:', error);
    return NextResponse.json({ 
      error: '招待処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 
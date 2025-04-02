import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// デバッグログ用の関数
function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// 招待メール送信関数（Supabaseのservice_roleを使用したメール送信）
async function sendInvitationEmail(email: string, token: string, inviterName: string, role: string, facilityName: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/register?token=${token}`;
  
  try {
    debugLog('招待メール送信開始', { email, baseUrl, inviteUrl });
    
    // Supabaseのservice_roleを使用してクライアントを作成
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE;
    
    debugLog('環境変数チェック', { 
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRole: !!supabaseServiceRole
    });
    
    if (!supabaseUrl || !supabaseServiceRole) {
      throw new Error('Supabase環境変数が設定されていません');
    }
    
    const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceRole);
    
    // Supabaseの招待メール送信機能を使用
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
      data: {
        invited_by: inviterName,
        role: role,
        facility_name: facilityName,
        token: token
      }
    });
    
    if (error) {
      debugLog('Supabase招待メール送信エラー:', error);
      return { success: false, error };
    }
    
    debugLog('招待メール送信成功:', data);
    return { success: true, data };
  } catch (error) {
    debugLog('招待メール送信エラー:', error);
    return { success: false, error };
  }
}

// POST: 新規ユーザー招待
export async function POST(request: NextRequest) {
  try {
    debugLog('招待API呼び出し開始');
    
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    
    debugLog('セッション情報:', { hasSession: !!session });
    
    if (!session) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    
    const currentUserId = session.user.id;
    debugLog('現在のユーザーID:', currentUserId);
    
    // 招待者のプロフィール情報を取得
    const { data: inviterProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*, facilities(name)')
      .eq('id', currentUserId)
      .single();
    
    debugLog('プロフィール取得結果:', { 
      hasProfile: !!inviterProfile,
      error: profileError
    });
    
    if (profileError || !inviterProfile) {
      return NextResponse.json({ error: 'プロフィール情報の取得に失敗しました' }, { status: 500 });
    }
    
    // 招待者が管理者権限を持っているか確認
    if (inviterProfile.role !== 'superuser' && inviterProfile.role !== 'facility_admin') {
      return NextResponse.json({ error: 'ユーザー招待権限がありません' }, { status: 403 });
    }
    
    const { email, role, facilityId, departmentId } = await request.json();
    debugLog('リクエストデータ:', { email, role, facilityId, departmentId });
    
    if (!email || !role || !facilityId) {
      return NextResponse.json({ error: 'メールアドレス、ロール、施設IDは必須です' }, { status: 400 });
    }
    
    // facility_adminは自分の施設のみユーザー招待可能
    if (inviterProfile.role === 'facility_admin' && inviterProfile.facility_id !== facilityId) {
      return NextResponse.json({ error: '他の施設へのユーザー招待権限がありません' }, { status: 403 });
    }
    
    // 招待トークンを生成（UUID + タイムスタンプ）
    const token = `${uuidv4()}-${Date.now()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    debugLog('招待トークン生成:', { token, expiresAt });
    
    // 招待レコードをDBに保存
    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .insert({
        email,
        invited_by: currentUserId,
        facility_id: facilityId,
        department_id: departmentId || null,
        role,
        invitation_token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();
    
    debugLog('招待レコード保存結果:', { 
      hasInvitation: !!invitation,
      error: invitationError
    });
    
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
    
    debugLog('施設情報取得結果:', { facility });
    
    // 招待メールを送信
    const emailResult = await sendInvitationEmail(
      email, 
      token,
      inviterProfile.full_name || inviterProfile.username || '管理者',
      role,
      facility?.name || '医療施設'
    );
    
    debugLog('メール送信結果:', emailResult);
    
    if (!emailResult.success) {
      // メール送信に失敗した場合は招待レコードを削除
      await supabase.from('user_invitations').delete().eq('id', invitation.id);
      return NextResponse.json({ error: '招待メールの送信に失敗しました' }, { status: 500 });
    }
    
    // アクティビティログを記録
    const { error: activityError } = await supabase.from('user_activity_logs').insert({
      user_id: currentUserId,
      action_type: 'user_invitation_sent',
      action_details: { invited_email: email, role, facility_id: facilityId },
      performed_by: currentUserId
    });
    
    debugLog('アクティビティログ記録結果:', { error: activityError });
    
    if (activityError) {
      debugLog('アクティビティログ記録エラー:', activityError);
    }
    
    return NextResponse.json({ success: true, invitation });
    
  } catch (error) {
    debugLog('招待処理エラー:', error);
    return NextResponse.json({ 
      error: '招待処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// GET: 招待リスト取得
export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  
  const currentUserId = session.user.id;
  
  // ユーザーの権限を取得
  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role, facility_id')
    .eq('id', currentUserId)
    .single();
  
  if (profileError || !userProfile) {
    return NextResponse.json({ error: 'プロフィール情報の取得に失敗しました' }, { status: 500 });
  }
  
  let query = supabase.from('user_invitations').select(`
    *,
    facilities(name),
    departments(name),
    invited_by_profiles:profiles!invited_by(full_name, username)
  `);
  
  // ロールに応じてフィルタリング
  if (userProfile.role === 'facility_admin') {
    // 施設管理者は自分の施設の招待のみ表示
    query = query.eq('facility_id', userProfile.facility_id);
  } else if (userProfile.role !== 'superuser') {
    // スーパーユーザーでなく施設管理者でもない場合はアクセス不可
    return NextResponse.json({ error: '招待リストへのアクセス権限がありません' }, { status: 403 });
  }
  
  // 検索条件があれば適用
  const searchParams = request.nextUrl.searchParams;
  if (searchParams.has('email')) {
    query = query.ilike('email', `%${searchParams.get('email')}%`);
  }
  if (searchParams.has('is_used')) {
    query = query.eq('is_used', searchParams.get('is_used') === 'true');
  }
  
  // 並び順: 作成日時の降順
  query = query.order('created_at', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: '招待リストの取得に失敗しました' }, { status: 500 });
  }
  
  return NextResponse.json({ invitations: data });
} 
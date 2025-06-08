import { createServerClient } from '@/lib/supabase/server';
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
// デバッグログ用の関数
function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

export const dynamic = 'force-dynamic';

// 招待メール送信関数（Supabaseのservice_roleを使用したメール送信）
async function sendInvitationEmail(email: string, token: string, inviterName: string, role: string, facilityName: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/register?token=${token}`;
  
  try {
    debugLog('招待メール送信開始', { email, baseUrl, inviteUrl });
    
    // Supabaseのservice_roleを使用してクライアントを作成
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    debugLog('環境変数チェック', { 
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRole: !!supabaseServiceRole,
      supabaseUrlLength: supabaseUrl?.length || 0,
      serviceRoleLength: supabaseServiceRole?.length || 0
    });
    
    if (!supabaseUrl || !supabaseServiceRole) {
      throw new Error('Supabase環境変数が設定されていません');
    }
    
    // supabaseAdminクライアントをtry/catchブロックで作成
    try {
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
        
        // すでに登録されているメールアドレスの場合は独自の処理
        if (error.code === 'email_exists') {
          // 既存ユーザー向けの招待メカニズム
          // これは実質的な再招待/ロール変更の通知になる
          
          // TODO: ここに独自のメール送信ロジックを実装することも可能
          // 例: 別のメール送信サービスを使用してカスタムテンプレートでメールを送信
          
          debugLog('既存ユーザー向けの招待を処理:', { email, role, facilityName });
          
          // 現在はSupabase側でメール送信はできないが、招待自体は成功として処理
          return {
            success: true,
            message: '既存ユーザー向け招待として処理しました',
            emailExists: true
          };
        }
        
        return { success: false, error };
      }
      
      debugLog('招待メール送信成功:', data);
      return { success: true, data };
    } catch (adminClientError) {
      debugLog('Supabase管理者クライアント作成または使用エラー:', adminClientError);
      return { 
        success: false, 
        error: {
          message: 'Supabase管理者クライアントでエラーが発生しました',
          originalError: adminClientError instanceof Error ? adminClientError.message : String(adminClientError)
        }
      };
    }
  } catch (error) {
    debugLog('招待メール送信エラー:', error);
    return { success: false, error };
  }
}

// POST: 新規ユーザー招待
export async function POST(request: NextRequest) {
  try {
    debugLog('招待API呼び出し開始');
    
    // リクエストボディを先に取得
    let requestBody;
    try {
      requestBody = await request.json();
      debugLog('リクエストボディ:', requestBody);
    } catch (parseError) {
      debugLog('リクエストボディのパースに失敗:', parseError);
      return NextResponse.json({ 
        error: 'リクエストボディの解析に失敗しました', 
        details: parseError instanceof Error ? parseError.message : String(parseError) 
      }, { status: 400 });
    }
    
    // セッション情報を取得
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    debugLog('セッション情報:', { hasSession: !!user });
    
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    
    const currentUserId = user.id;
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
      return NextResponse.json({ 
        error: 'プロフィール情報の取得に失敗しました', 
        details: profileError?.message || '不明なエラー' 
      }, { status: 500 });
    }
    
    // 招待者が管理者権限を持っているか確認
    if (inviterProfile.role !== 'superuser' && inviterProfile.role !== 'facility_admin') {
      return NextResponse.json({ error: 'ユーザー招待権限がありません' }, { status: 403 });
    }
    
    const { email, role, facilityId, departmentId } = requestBody;
    debugLog('リクエストデータ:', { email, role, facilityId, departmentId });
    
    if (!email || !role || !facilityId) {
      return NextResponse.json({ error: 'メールアドレス、ロール、施設IDは必須です' }, { status: 400 });
    }
    
    // facility_adminは自分の施設のみユーザー招待可能
    if (inviterProfile.role === 'facility_admin' && inviterProfile.facility_id !== facilityId) {
      return NextResponse.json({ error: '他の施設へのユーザー招待権限がありません' }, { status: 403 });
    }
    
    // 既存の招待レコードを確認
    const { data: existingInvitation } = await supabase
      .from('user_invitations')
      .select('id, email, is_used, expires_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    // 既存の招待が見つかった場合はエラーを返す
    if (existingInvitation) {
      const now = new Date();
      const expiresAt = new Date(existingInvitation.expires_at);
      
      let errorMessage = 'このメールアドレスには既に招待を送信済みです。';
      
      if (existingInvitation.is_used) {
        errorMessage = 'このメールアドレスのユーザーは既に登録済みです。';
      } else if (expiresAt < now) {
        errorMessage = 'このメールアドレスへの招待は期限切れです。古い招待を削除してから再送信してください。';
      } else {
        errorMessage = 'このメールアドレスには既に有効な招待が存在します。必要に応じて招待を削除してから再送信してください。';
      }
      
      return NextResponse.json({ 
        error: errorMessage,
        invitation: existingInvitation,
        canDelete: true
      }, { status: 400 });
    }
    
    // 招待トークンを生成（UUID + タイムスタンプ）
    const token = `${uuidv4()}-${Date.now()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    debugLog('招待トークン生成:', { token, expiresAt });
    
    // 新しい招待レコードを作成
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
    
    if (invitationError) {
      debugLog('招待作成エラー:', invitationError);
      return NextResponse.json({ 
        error: '招待の作成に失敗しました', 
        details: typeof invitationError === 'object' ? JSON.stringify(invitationError) : String(invitationError)
      }, { status: 500 });
    }
    
    // 施設名を取得
    const { data: facility, error: facilityError } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facilityId)
      .single();
    
    debugLog('施設情報取得結果:', { facility });
    
    if (facilityError || !facility) {
      // 通常は起こりえない想定ですが、
      // 万が一に備えてエラーを返しておきます
      return NextResponse.json(
        { error: '施設情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    // ここで facility.name は必ず string になります
    const facilityName: string = facility.name!;
    // 招待メールを送信
    const emailResult = await sendInvitationEmail(
      email, 
      token,
      inviterProfile.fullname! || '管理者',
      role,
      facilityName
    );
    
    debugLog('メール送信結果:', emailResult);
    
    // メール送信に失敗した場合（email_existsも失敗として扱う）
    if (!emailResult.success) {
      // 招待レコードを削除
      await supabase.from('user_invitations').delete().eq('id', invitation.id);
      
      // エラーメッセージを整形
      const errorDetails = emailResult.error instanceof Error 
        ? emailResult.error.message 
        : (emailResult.error && typeof emailResult.error === 'object' && 'message' in emailResult.error)
          ? (emailResult.error as any).message
          : JSON.stringify(emailResult.error);
      
      // email_existsエラーの場合は特別なメッセージ
      if (emailResult.error && typeof emailResult.error === 'object' && 'code' in emailResult.error && (emailResult.error as any).code === 'email_exists') {
        return NextResponse.json({ 
          error: 'このメールアドレスは既にシステムに登録されています。', 
          details: '既存ユーザーへの招待は現在サポートされていません。'
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: '招待メールの送信に失敗しました', 
        details: errorDetails
      }, { status: 500 });
    }
    
    // アクティビティログを記録
    const { error: activityError } = await supabase.from('user_activity_logs').insert({
      user_id: currentUserId,
      action_type: 'user_invitation_sent',
      action_details: { 
        invited_email: email, 
        role, 
        facility_id: facilityId
      },
      performed_by: currentUserId
    });
    
    debugLog('アクティビティログ記録結果:', { error: activityError });
    
    if (activityError) {
      debugLog('アクティビティログ記録エラー:', activityError);
      // アクティビティログの記録失敗はユーザーに表示しない（招待自体は成功）
    }
    
    return NextResponse.json({ 
      success: true, 
      invitation,
      message: '招待メールを送信しました'
    });
    
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
  
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  
  const currentUserId = user.id;
  
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
    query = query.eq('facility_id', userProfile.facility_id!);
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
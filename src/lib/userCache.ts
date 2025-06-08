// ユーザーデータのキャッシュ用ユーティリティ

interface UserProfile {
  id: string;
  fullname: string;
  facility_id?: string;
}

const CACHE_KEY = 'cached_user_profile';

// ユーザープロファイルをキャッシュに保存
export function cacheUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('ユーザープロファイルのキャッシュ保存に失敗しました:', error);
  }
}

// キャッシュからユーザープロファイルを取得
export function getCachedUserProfile(): UserProfile | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('キャッシュからのユーザープロファイル取得に失敗しました:', error);
    return null;
  }
}

// キャッシュをクリア
export function clearUserProfileCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('ユーザープロファイルのキャッシュクリアに失敗しました:', error);
  }
}

// 共通関数: ユーザー情報を取得（キャッシュ優先、なければデータベースから取得）
export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    // まずキャッシュを確認
    const cachedProfile = getCachedUserProfile();
    if (cachedProfile) {
      return cachedProfile;
    }
    
    // キャッシュになければSupabaseから取得
    const { data: supabaseUser, error: userError } = await import('@/lib/supabaseBrowser')
      .then((module) => module.default.auth.getUser());
      
    if (userError || !supabaseUser?.user) {
      console.error('認証ユーザー情報の取得に失敗しました:', userError);
      return null;
    }
    
    // プロファイル情報を取得
    const { data: profileData, error: profileError } = await import('@/lib/supabaseBrowser')
      .then((module) => module.default
        .from('profiles')
        .select('fullname, facility_id')
        .eq('id', supabaseUser.user.id)
        .single()
      );
      
    if (profileError) {
      console.error('プロファイル情報の取得に失敗しました:', profileError);
      return null;
    }
    
    if (!profileData) {
      return null;
    }
    
    // ユーザープロファイルを作成
    const userProfile: UserProfile = {
      id: supabaseUser.user.id,
      fullname: profileData.fullname || 'Unknown User',
      facility_id: profileData.facility_id
    };
    
    // キャッシュに保存
    cacheUserProfile(userProfile);
    
    return userProfile;
  } catch (error) {
    console.error('ユーザー情報の取得中にエラーが発生しました:', error);
    return null;
  }
} 
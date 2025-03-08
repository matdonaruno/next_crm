'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  fullname: string | null;
  facility_id: string | null;
}

// エラーの型を定義
interface ErrorType {
  message: string;
  status?: number;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: ErrorType | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<{ error: ErrorType | null }>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ローカルストレージのキー
const USER_CACHE_KEY = 'supabase_user';
const PROFILE_CACHE_KEY = 'user_profile';
const CACHE_TIMESTAMP_KEY = 'cache_timestamp';

// キャッシュの有効期間（1時間 = 60分 * 60秒 * 1000ミリ秒）
const CACHE_DURATION = 60 * 60 * 1000;

// ユーザー情報をキャッシュに保存する関数
const cacheUserData = (user: User, profile: UserProfile | null) => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    console.log('ユーザー情報をキャッシュに保存しました');
  } catch (error) {
    console.error('キャッシュ保存エラー:', error);
  }
};

// キャッシュからユーザー情報を取得する関数
const getCachedUserData = () => {
  if (typeof window === 'undefined') return { user: null, profile: null, isValid: false };
  
  try {
    const timestampStr = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestampStr) return { user: null, profile: null, isValid: false };
    
    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    const isValid = now - timestamp < CACHE_DURATION;
    
    if (!isValid) {
      // キャッシュが期限切れの場合、削除する
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(PROFILE_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      console.log('キャッシュが期限切れのため削除しました');
      return { user: null, profile: null, isValid: false };
    }
    
    const userStr = localStorage.getItem(USER_CACHE_KEY);
    const profileStr = localStorage.getItem(PROFILE_CACHE_KEY);
    
    const user = userStr ? JSON.parse(userStr) as User : null;
    const profile = profileStr ? JSON.parse(profileStr) as UserProfile : null;
    
    console.log('キャッシュからユーザー情報を取得しました');
    return { user, profile, isValid: true };
  } catch (error) {
    console.error('キャッシュ取得エラー:', error);
    return { user: null, profile: null, isValid: false };
  }
};

// キャッシュを削除する関数
const clearUserCache = () => {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    console.log('ユーザーキャッシュを削除しました');
  } catch (error) {
    console.error('キャッシュ削除エラー:', error);
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ユーザー情報とプロファイル情報を取得
  const fetchUserAndProfile = async (skipCache = false) => {
    try {
      // キャッシュをチェック（skipCacheがtrueの場合はスキップ）
      if (!skipCache) {
        const { user: cachedUser, profile: cachedProfile, isValid } = getCachedUserData();
        if (isValid && cachedUser && cachedProfile) {
          setUser(cachedUser);
          setProfile(cachedProfile);
          setLoading(false);
          return;
        }
      }

      console.log('Supabaseからユーザー情報を取得します');
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser();
      
      if (error || !supabaseUser) {
        setUser(null);
        setProfile(null);
        clearUserCache();
        return;
      }

      setUser(supabaseUser);

      // プロファイル情報を取得
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, fullname, facility_id')
        .eq('id', supabaseUser.id)
        .single();

      if (profileError) {
        console.error('プロファイル取得エラー:', profileError);
        setProfile(null);
        clearUserCache();
      } else {
        setProfile(profileData);
        // ユーザー情報とプロファイル情報をキャッシュに保存
        cacheUserData(supabaseUser, profileData);
      }
    } catch (error) {
      console.error('fetchUserAndProfileでエラー:', error);
      clearUserCache();
    } finally {
      setLoading(false);
    }
  };

  // 強制的にユーザーデータを更新する関数
  const refreshUserData = async () => {
    setLoading(true);
    await fetchUserAndProfile(true); // キャッシュをスキップして強制的に更新
    setLoading(false);
  };

  // 初期化時とauth状態変更時にユーザー情報を取得
  useEffect(() => {
    fetchUserAndProfile();

    // auth状態変更のリスナー
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('認証状態変更:', event);
        if (session?.user) {
          setUser(session.user);
          await fetchUserAndProfile(true); // 認証状態変更時は常に最新データを取得
        } else {
          setUser(null);
          setProfile(null);
          clearUserCache();
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ログイン処理
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error) {
        await fetchUserAndProfile(true); // ログイン時は常に最新データを取得
      }

      return { error: error as ErrorType | null };
    } catch (error) {
      console.error('ログインエラー:', error);
      return { error: { message: 'ログイン処理中に予期せぬエラーが発生しました' } };
    }
  };

  // ログアウト処理
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      clearUserCache();
      router.push('/login');
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // プロファイル更新処理
  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
      if (!user) return { error: { message: '認証されていません' } };

      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id);

      if (!error) {
        const updatedProfile = { ...profile, ...data } as UserProfile;
        setProfile(updatedProfile);
        // 更新したプロファイル情報をキャッシュに保存
        cacheUserData(user, updatedProfile);
      }

      return { error: error as ErrorType | null };
    } catch (error) {
      console.error('プロファイル更新エラー:', error);
      return { error: { message: 'プロファイル更新中に予期せぬエラーが発生しました' } };
    }
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    updateProfile,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface UserProfile {
  id: string;
  fullname: string | null;
  facility_id: string | null;
}

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<{ error: any | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // ユーザー情報とプロファイル情報を取得
  const fetchUserAndProfile = async () => {
    try {
      console.log("ユーザー情報とプロファイル情報の取得を開始");
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user) {
        console.error("ユーザー情報の取得に失敗:", error);
        setUser(null);
        setProfile(null);
        setLoading(false); // エラー時もローディング状態を解除
        return;
      }

      console.log("ユーザー情報を取得:", user.id);
      setUser(user);

      // プロファイル情報を取得
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, fullname, facility_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('プロファイル情報の取得に失敗:', profileError);
        setProfile(null);
      } else {
        console.log("プロファイル情報を取得:", profileData);
        setProfile(profileData);
      }
    } catch (error) {
      console.error('fetchUserAndProfile内でエラー発生:', error);
    } finally {
      console.log("ユーザー情報とプロファイル情報の取得を完了");
      setLoading(false); // 常にロード完了時にloadingをfalseに設定
    }
  };

  // 初期化時とauth状態変更時にユーザー情報を取得
  useEffect(() => {
    fetchUserAndProfile();

    // auth状態変更のリスナー
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchUserAndProfile();
        } else {
          setUser(null);
          setProfile(null);
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
      console.log("ログイン処理を開始");
      setLoading(true); // ログイン処理開始時にloadingをtrueに設定
      
      // 直接fetchUserAndProfileを呼び出さず、認証とプロファイル取得を直接行う
      console.log("Supabaseで認証を実行");
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("ログインエラー:", error.message);
        setLoading(false); // エラー時はloadingをfalseに設定
        return { error };
      }

      if (!data || !data.user) {
        console.error("ユーザーデータが取得できませんでした");
        setLoading(false);
        return { error: new Error("ユーザーデータが取得できませんでした") };
      }

      console.log("ログイン成功、ユーザー情報:", data.user.id);
      
      // ユーザー情報を設定
      setUser(data.user);
      
      try {
        // プロファイル情報を取得
        console.log("プロファイル情報を取得中...");
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, fullname, facility_id')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('プロファイル情報の取得に失敗:', profileError);
          setProfile(null);
        } else {
          console.log("プロファイル情報を取得:", profileData);
          setProfile(profileData);
        }
      } catch (profileError) {
        console.error("プロファイル取得中にエラー:", profileError);
        // プロファイル取得に失敗しても認証自体は成功とする
      }
      
      console.log("認証処理完了、loading状態をfalseに設定");
      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('ログイン処理中に例外が発生:', error);
      setLoading(false); // 例外発生時もloadingをfalseに設定
      return { error };
    }
  };

  // ログアウト処理
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // プロファイル更新処理
  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
      if (!user) return { error: new Error('User not authenticated') };

      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id);

      if (!error) {
        setProfile(prev => prev ? { ...prev, ...data } : null);
      }

      return { error };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { error };
    }
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    updateProfile,
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
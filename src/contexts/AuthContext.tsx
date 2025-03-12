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
      console.log("fetchUserAndProfile: ユーザー情報とプロファイル情報の取得を開始");
      const { data: { user }, error } = await supabase.auth.getUser();
      
      console.log("fetchUserAndProfile: supabase.auth.getUser の結果:", { user: user?.id || 'なし', error: error?.message || 'なし' });
      
      if (error || !user) {
        console.error("fetchUserAndProfile: ユーザー情報の取得に失敗:", error);
        setUser(null);
        setProfile(null);
        setLoading(false); // エラー時もローディング状態を解除
        return;
      }

      console.log("fetchUserAndProfile: ユーザー情報を取得:", user.id);
      setUser(user);

      // プロファイル情報を取得
      console.log("fetchUserAndProfile: プロファイル情報の取得を開始:", user.id);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, fullname, facility_id')
        .eq('id', user.id)
        .single();

      console.log("fetchUserAndProfile: プロファイル取得結果:", { 
        profileData: profileData ? JSON.stringify(profileData) : 'なし', 
        profileError: profileError?.message || 'なし' 
      });

      if (profileError) {
        console.error('fetchUserAndProfile: プロファイル情報の取得に失敗:', profileError);
        setProfile(null);
      } else {
        console.log("fetchUserAndProfile: プロファイル情報を取得:", profileData);
        setProfile(profileData);
      }
    } catch (error) {
      console.error('fetchUserAndProfile: 例外が発生:', error);
    } finally {
      console.log("fetchUserAndProfile: ユーザー情報とプロファイル情報の取得を完了, loading=false に設定");
      setLoading(false); // 常にロード完了時にloadingをfalseに設定
    }
  };

  // 初期化時とauth状態変更時にユーザー情報を取得
  useEffect(() => {
    console.log("AuthContext: 初期化処理を開始");
    
    // セッション管理を一元化した初期化処理
    const initializeAuth = async () => {
      console.log("AuthContext: 認証初期化を開始");
      setLoading(true);

      try {
        // セッション取得のプロミスを作成
        const authSessionPromise = supabase.auth.getSession();
        
        // タイムアウト用のプロミスを作成（8秒後にタイムアウト）
        const timeoutPromise = new Promise<{data: {session: null}, error: Error}>((_, reject) => {
          setTimeout(() => reject(new Error("認証タイムアウト: セッション取得に時間がかかりすぎています")), 8000);
        });
        
        // 両方のプロミスを競争させる
        const result = await Promise.race([authSessionPromise, timeoutPromise]);
        const { data, error } = result;
        
        console.log("AuthContext: セッション初期化結果", { 
          hasSession: !!data.session, 
          userId: data.session?.user?.id || "なし",
          error: error?.message || "なし",
          timestamp: new Date().toISOString()
        });

        if (error) {
          console.error("AuthContext: セッション初期化エラー:", error.message);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (data.session?.user) {
          console.log("AuthContext: セッション初期化成功、ユーザーID:", data.session.user.id);
          setUser(data.session.user);
          
          console.log("AuthContext: プロファイル情報取得を開始");
          try {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single();

            console.log("AuthContext: プロファイル取得結果", { 
              success: !!profileData, 
              error: profileError?.message || "なし",
              timestamp: new Date().toISOString()
            });

            if (profileError) {
              console.error("AuthContext: プロファイル取得エラー:", profileError.message);
              setProfile(null);
            } else {
              console.log("AuthContext: プロファイル取得成功:", profileData);
              setProfile(profileData);
            }
          } catch (e) {
            console.error("AuthContext: プロファイル取得中に例外発生:", e);
            setProfile(null);
          }
        } else {
          console.log("AuthContext: 有効なセッションなし");
          setUser(null);
          setProfile(null);
        }
      } catch (e) {
        console.error("AuthContext: 認証初期化中に例外発生:", e);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
        console.log("AuthContext: 認証初期化完了");
      }
    };
    
    // 初期化処理を実行
    initializeAuth();
    
    // 認証状態変更のリスナー
    console.log("AuthContext: 認証状態変更リスナーを設定");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("AuthContext: 認証状態変更イベント:", event, "セッション:", session?.user?.id || 'なし');
        
        if (session?.user) {
          console.log("AuthContext: 認証状態変更 - ユーザーあり:", session.user.id);
          setUser(session.user);
          
          // プロファイル情報を取得
          console.log("AuthContext: 状態変更後のプロファイル情報取得:", session.user.id);
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, fullname, facility_id')
            .eq('id', session.user.id)
            .single();
          
          if (profileError) {
            console.error('AuthContext: 状態変更後のプロファイル取得失敗:', profileError);
            setProfile(null);
          } else {
            console.log("AuthContext: 状態変更後のプロファイル取得成功:", profileData);
            setProfile(profileData);
          }
          
          // 明示的にローディング状態を解除
          console.log("AuthContext: 認証状態変更処理完了 - loading=false に設定");
          setLoading(false);
        } else {
          console.log("AuthContext: 認証状態変更 - ユーザーなし");
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      console.log("AuthContext: クリーンアップ - リスナー解除");
      subscription.unsubscribe();
    };
  }, []);

  // ログイン処理
  const signIn = async (email: string, password: string) => {
    try {
      console.log("signIn: ログイン処理を開始:", email);
      setLoading(true); // ログイン処理開始時にloadingをtrueに設定
      
      // 直接fetchUserAndProfileを呼び出さず、認証とプロファイル取得を直接行う
      console.log("signIn: Supabaseで認証を実行");
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("signIn: 認証結果:", { 
        success: !!data?.user, 
        userId: data?.user?.id || 'なし', 
        error: error?.message || 'なし' 
      });

      if (error) {
        console.error("signIn: ログインエラー:", error.message);
        setLoading(false); // エラー時はloadingをfalseに設定
        return { error };
      }

      if (!data || !data.user) {
        console.error("signIn: ユーザーデータが取得できませんでした");
        setLoading(false);
        return { error: new Error("ユーザーデータが取得できませんでした") };
      }

      console.log("signIn: ログイン成功、ユーザー情報:", data.user.id);
      
      // ユーザー情報を設定
      setUser(data.user);
      
      try {
        // プロファイル情報を取得
        console.log("signIn: プロファイル情報を取得中...", data.user.id);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, fullname, facility_id')
          .eq('id', data.user.id)
          .single();

        console.log("signIn: プロファイル取得結果:", { 
          profileData: profileData ? JSON.stringify(profileData) : 'なし', 
          profileError: profileError?.message || 'なし' 
        });

        if (profileError) {
          console.error('signIn: プロファイル情報の取得に失敗:', profileError);
          setProfile(null);
        } else {
          console.log("signIn: プロファイル情報を取得:", profileData);
          setProfile(profileData);
        }
      } catch (profileError) {
        console.error("signIn: プロファイル取得中にエラー:", profileError);
        // プロファイル取得に失敗しても認証自体は成功とする
      }
      
      console.log("signIn: 認証処理完了、loading状態をfalseに設定");
      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('signIn: ログイン処理中に例外が発生:', error);
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
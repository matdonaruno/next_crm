'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Cookies from 'js-cookie';

// グローバルウィンドウにCookiesを追加
declare global {
  interface Window {
    Cookies: typeof Cookies;
  }
}

// Cookiesをグローバルに設定
if (typeof window !== 'undefined') {
  window.Cookies = Cookies;
}

interface UserProfile {
  id: string;
  fullname: string | null;
  facility_id: string | null;
  department_id?: string | null;
  email?: string | null;
  role?: string | null;
  is_active?: boolean;
}

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  loadingState: 'idle' | 'authenticating' | 'loading-profile' | 'error';
  loadingMessage: string;
  manualReload: () => void;
  signIn: (email: string, password: string) => Promise<{ error: any | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<{ error: any | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 非アクティブタイムアウト（ミリ秒）- 30分
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;

// セッション確認間隔（ミリ秒）- 5分に設定（元々は短い間隔だった可能性がある）
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;

// セッション確認の有効化フラグ - デフォルトでは無効化（必要なページでのみ有効化する）
let SESSION_CHECK_ENABLED = false;

// データ取得タイムアウト（ミリ秒）- 15秒
const DATA_FETCH_TIMEOUT = 15000;
// 最大再試行回数
const MAX_RETRY_COUNT = 3;
// 再試行間隔（ミリ秒）
const RETRY_INTERVAL = 1000;
// セッションキャッシュキー
const SESSION_CACHE_KEY = 'auth_session_cache';
// プロファイルキャッシュキー
const PROFILE_CACHE_KEY = 'auth_profile_cache';
// キャッシュ有効期限（ミリ秒）- 30分
const CACHE_EXPIRY = 30 * 60 * 1000;

// グローバルフラグを設定する関数
export const setSessionCheckEnabled = (enabled: boolean) => {
  SESSION_CHECK_ENABLED = enabled;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingState, setLoadingState] = useState<'idle' | 'authenticating' | 'loading-profile' | 'error'>('idle');
  const [loadingMessage, setLoadingMessage] = useState<string>('読み込み中...');
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [retryCount, setRetryCount] = useState<number>(0);
  const router = useRouter();

  // 手動リロード - 状態をリセットしてからリロード
  const manualReload = () => {
    if (typeof window !== 'undefined') {
      // キャッシュをクリア
      clearAllAuthStorage();
      console.log("AuthContext: 手動リロードを実行、キャッシュをクリア");
      
      // 現在のURLを取得
      const currentUrl = window.location.href;
      
      // ステートをリセット
      setUser(null);
      setProfile(null);
      setLastActivity(Date.now());
      
      // 5msの遅延を設けてブラウザがステートの変更を処理するのを待つ
      setTimeout(() => {
        window.location.href = currentUrl;
      }, 5);
    }
  };

  // セッションキャッシュの管理
  const getCachedSession = () => {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    
    const { session, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return session;
  };

  const setCachedSession = (session: any) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      session,
      timestamp: Date.now()
    }));
  };

  // プロファイルキャッシュの管理
  const getCachedProfile = () => {
    if (typeof window === 'undefined') return null;
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!cached) return null;
    
    const { profile, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return profile;
  };

  const setCachedProfile = (profile: UserProfile) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      profile,
      timestamp: Date.now()
    }));
  };

  // プロファイル取得タイムアウト処理
  const handleProfileTimeout = () => {
    console.log("AuthContext: プロファイル取得タイムアウト発生");
    setLoadingState('error');
    setLoadingMessage('プロファイル情報の取得に時間がかかっています。手動で再読み込みしてください。');
    setLoading(false);
  };

  // プロファイルキャッシュをクリア
  const clearProfileCache = () => {
    if (typeof window === 'undefined') return;
    console.log("AuthContext: プロフィールキャッシュをクリア");
    localStorage.removeItem(PROFILE_CACHE_KEY);
  };

  // プロファイル情報を取得する関数（キャッシュ対応）
  const fetchProfileWithRetry = async (userId: string, maxRetries = MAX_RETRY_COUNT, skipCache = false): Promise<{ data: UserProfile | null, error: any | null }> => {
    // キャッシュをスキップするかチェック
    if (skipCache) {
      console.log("AuthContext: キャッシュをスキップしてプロフィールを取得");
      clearProfileCache();
    } else {
      // キャッシュされたプロファイルを確認
      const cachedProfile = getCachedProfile();
      if (cachedProfile) {
        console.log("AuthContext: キャッシュされたプロファイルを使用");
        return { data: cachedProfile, error: null };
      }
    }

    // リクエストが複数回実行されるのを防ぐためのフラグ
    let isRequestCompleted = false;
    
    try {
      console.log(`AuthContext: プロファイル情報取得開始 (最大${maxRetries}回試行)`);
      let retryAttempt = 0;
    
      // タイムアウト処理
      const timeoutPromise = new Promise<{ data: UserProfile | null, error: any | null }>((resolve) => {
        setTimeout(() => {
          if (!isRequestCompleted) {
            console.log("AuthContext: プロファイル取得タイムアウト");
            resolve({ data: null, error: new Error("タイムアウト") });
          }
        }, DATA_FETCH_TIMEOUT);
      });
      
      // 実際のリクエスト処理
      const fetchPromise = (async () => {
        while (retryAttempt < maxRetries && !isRequestCompleted) {
          try {
            if (retryAttempt > 0) {
              setLoadingMessage(`プロファイル情報を再取得中... (${retryAttempt}/${maxRetries})`);
            }
            
            console.log(`AuthContext: プロファイル取得試行 ${retryAttempt + 1}/${maxRetries}`);
            
            // Supabaseクエリにヘッダーを追加して406エラーを回避
            const options = {
              count: 'exact'
            };
            
            const { data, error } = await supabase
              .from('profiles')
              .select('*', options)
              .eq('id', userId)
              .single();
              
            if (data) {
              console.log("AuthContext: プロファイル取得成功:", data);
              // プロファイルをキャッシュ
              setCachedProfile(data);
              isRequestCompleted = true;
              return { data, error: null };
            }
            
            console.log("AuthContext: プロファイル取得失敗:", error);
            
            // プロファイルが存在しない場合は作成を試みる
            if (error && (error.code === 'PGRST116' || error.message?.includes('JSON object') || error.status === 406)) {
              console.log("AuthContext: プロファイルが存在しません。新規作成を試みます");
              
              // ユーザー情報を取得
              const { data: userData, error: userError } = await supabase.auth.getUser();
              if (userError || !userData.user) {
                console.error("AuthContext: ユーザー情報取得エラー:", userError);
                continue;
              }
              
              // ユーザーメタデータからプロファイル情報を抽出
              const userMeta = userData.user.user_metadata || {};
              
              // 新しいプロファイルを作成
              const profileData = {
                id: userId,
                fullname: userMeta.full_name || null,
                email: userData.user.email,
                facility_id: userMeta.facility_id || null,
                department_id: userMeta.department_id || null,
                role: userMeta.role || 'regular_user',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              
              console.log("AuthContext: 新規プロファイル作成:", profileData);
              
              try {
                // プロファイルを直接サーバーAPIで作成
                const response = await fetch('/api/user/create-profile', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(profileData),
                });
                
                if (response.ok) {
                  const newProfile = await response.json();
                  console.log("AuthContext: 新規プロファイル作成成功:", newProfile);
                  setCachedProfile(newProfile);
                  isRequestCompleted = true;
                  return { data: newProfile, error: null };
                } else {
                  console.error("AuthContext: プロファイル作成API呼び出し失敗:", await response.text());
                }
              } catch (createError) {
                console.error("AuthContext: プロファイル作成中にエラー:", createError);
              }
            }
            
            if (retryAttempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
            }
            
            retryAttempt++;
          } catch (e) {
            console.error("AuthContext: プロファイル取得中に例外発生:", e);
            
            if (retryAttempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
            }
            
            retryAttempt++;
          }
        }
        
        isRequestCompleted = true;
        return { data: null, error: new Error("プロファイル情報の取得に失敗しました") };
      })();
      
      // タイムアウトとリクエストのどちらか早い方を待つ
      const result = await Promise.race([timeoutPromise, fetchPromise]);
      isRequestCompleted = true;
      return result;
    } catch (e) {
      console.error("AuthContext: プロファイル取得処理で例外発生:", e);
      return { data: null, error: e };
    }
  };

  // ユーザーアクティビティを追跡
  useEffect(() => {
    if (!user) return; // ユーザーがログインしていない場合は何もしない

    console.log("AuthContext: ユーザーアクティビティ追跡を開始");
    
    // アクティビティイベントのリスナー
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    
    // アクティビティを記録する関数
    const recordActivity = () => {
      setLastActivity(Date.now());
    };
    
    // イベントリスナーを追加
    activityEvents.forEach(event => {
      window.addEventListener(event, recordActivity);
    });
    
    // 非アクティブタイムアウトのチェック
    const inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
        console.log("AuthContext: 非アクティブタイムアウトを検出、ログアウトします");
        clearInterval(inactivityCheckInterval);
        signOut();
      }
    }, 60000); // 1分ごとにチェック
    
    // クリーンアップ
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, recordActivity);
      });
      clearInterval(inactivityCheckInterval);
    };
  }, [user, lastActivity]);

  // 初期化時とauth状態変更時にユーザー情報を取得
  useEffect(() => {
    console.log("AuthContext: 初期化処理を開始");
    setLoadingState('authenticating');
    setLoadingMessage('認証状態を確認中...');
    
    // セッション管理を一元化した初期化処理
    const initializeAuth = async () => {
      console.log("AuthContext: 認証初期化を開始");
      setLoading(true);

      try {
        // まずキャッシュされたセッションをチェック
        const cachedSession = getCachedSession();
        if (cachedSession) {
          console.log("AuthContext: キャッシュされたセッションを使用");
          setUser(cachedSession.user);
          
          // キャッシュからプロファイルを取得
          const cachedProfile = getCachedProfile();
          if (cachedProfile) {
            console.log("AuthContext: キャッシュされたプロファイルを使用");
            setProfile(cachedProfile);
            setLoading(false);
            setLoadingState('idle');
            setLoadingMessage('');
            return;
          }
          
          // プロファイルをキャッシュから取得できない場合は取得処理を実行
          setLoadingState('loading-profile');
          setLoadingMessage('プロファイル情報を読み込み中...');
          
          // プロファイル情報を取得（タイムアウトはfetchProfileWithRetry内で処理）
          const { data: profileData, error: profileError } = await fetchProfileWithRetry(cachedSession.user.id, MAX_RETRY_COUNT, false);
          
          if (profileData) {
            setProfile(profileData);
            setLoadingState('idle');
            setLoadingMessage('');
          } else {
            console.error("AuthContext: プロファイル取得エラー:", profileError?.message);
            setProfile(null);
            setLoadingState('error');
            setLoadingMessage('プロファイル情報の取得に失敗しました。手動で再読み込みしてください。');
          }
          
          setLoading(false);
          return;
        }

        // キャッシュにセッションがない場合はサーバーから取得
        const { data, error } = await supabase.auth.getSession();
        
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
          setLoadingState('error');
          setLoadingMessage('セッションの取得に失敗しました');
          return;
        }

        if (data.session?.user) {
          console.log("AuthContext: セッション初期化成功、ユーザーID:", data.session.user.id);
          setUser(data.session.user);
          setCachedSession(data.session);
          
          setLoadingState('loading-profile');
          setLoadingMessage('プロファイル情報を読み込み中...');
          
          // プロファイル情報を取得（タイムアウトはfetchProfileWithRetry内で処理）
          const { data: profileData, error: profileError } = await fetchProfileWithRetry(data.session.user.id, MAX_RETRY_COUNT, true);

          if (profileData) {
            setProfile(profileData);
            setLoadingState('idle');
            setLoadingMessage('');
          } else {
            console.error("AuthContext: プロファイル取得エラー:", profileError?.message);
            setProfile(null);
            setLoadingState('error');
            setLoadingMessage('プロファイル情報の取得に失敗しました。手動で再読み込みしてください。');
          }
        } else {
          console.log("AuthContext: アクティブなセッションなし");
          setUser(null);
          setProfile(null);
          setLoadingState('idle');
          setLoadingMessage('');
        }
      } catch (error) {
        console.error("AuthContext: 初期化エラー:", error);
        setUser(null);
        setProfile(null);
        setLoadingState('error');
        setLoadingMessage('予期せぬエラーが発生しました');
      } finally {
        console.log("AuthContext: 初期化完了");
        setLoading(false);
      }
    };

    initializeAuth();

    // 認証状態の変更をリッスンする関数を定義
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("AuthContext: 認証状態変更イベント:", event);
      
      // ユーザー状態を更新
      if (session?.user) {
        setUser(session.user);
        setCachedSession(session);
      } else {
        setUser(null);
        setProfile(null);
      }
      
      // ログイン時のみプロファイル情報を取得
      if (event === 'SIGNED_IN' && session?.user) {
        setLoadingState('loading-profile');
        setLoadingMessage('プロファイル情報を読み込み中...');
        
        fetchUserAndProfile(session.user.id);
      }
    });

    // クリーンアップ関数
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 定期的なセッション確認の設定
  useEffect(() => {
    if (!user) return;
    if (!SESSION_CHECK_ENABLED) {
      console.log("AuthContext: セッション確認は無効化されています");
      return;
    }

    // セッション確認が有効な場合のみログ出力
    console.log("AuthContext: 定期的なセッション確認を開始（" + SESSION_CHECK_INTERVAL/60000 + "分間隔）");
    
    const sessionCheckInterval = setInterval(async () => {
      // セッション確認をスキップする条件
      if (!SESSION_CHECK_ENABLED) {
        return;
      }

      try {
        // キャッシュされたセッションを確認
        const cachedSession = getCachedSession();
        if (cachedSession) {
          // キャッシュがある場合は詳細ログは出力しない
          return;
        }
        
        // デバッグモードが有効な場合のみ詳細ログを出力（本番環境では出力しない）
        if (process.env.NODE_ENV === 'development') {
          console.log("AuthContext: セッションの有効性を確認中...");
        }
        
        const { data, error } = await supabase.auth.getSession();
        
        if (error || !data.session) {
          console.log("AuthContext: セッションが無効になっています、ログアウトします");
          clearInterval(sessionCheckInterval);
          setUser(null);
          setProfile(null);
          router.push('/login');
        } else {
          // セッションをキャッシュ
          setCachedSession(data.session);
        }
      } catch (e) {
        console.error("AuthContext: セッション確認中にエラーが発生しました", e);
      }
    }, SESSION_CHECK_INTERVAL);
    
    return () => {
      clearInterval(sessionCheckInterval);
    };
  }, [user, router]);

  // ユーザー情報とプロファイル情報を取得
  const fetchUserAndProfile = async (userId: string) => {
    try {
      console.log("fetchUserAndProfile: ユーザー情報とプロファイル情報の取得を開始");
      setLoadingState('authenticating');
      setLoadingMessage('ユーザー情報を確認中...');
      
      const { data: { user }, error } = await supabase.auth.getUser();
      
      console.log("fetchUserAndProfile: supabase.auth.getUser の結果:", { user: user?.id || 'なし', error: error?.message || 'なし' });
      
      if (error || !user) {
        console.error("fetchUserAndProfile: ユーザー情報の取得に失敗:", error);
        setUser(null);
        setProfile(null);
        setLoading(false); // エラー時もローディング状態を解除
        setLoadingState('error');
        setLoadingMessage('ユーザー情報の取得に失敗しました');
        return;
      }

      console.log("fetchUserAndProfile: ユーザー情報を取得:", user.id);
      setUser(user);

      // プロファイル情報を取得
      console.log("fetchUserAndProfile: プロファイル情報の取得を開始:", user.id);
      setLoadingState('loading-profile');
      setLoadingMessage('プロファイル情報を読み込み中...');
      
      // 再試行ロジックを使用
      const { data: profileData, error: profileError } = await fetchProfileWithRetry(user.id);

      if (!profileData) {
        console.error('fetchUserAndProfile: プロファイル情報の取得に失敗:', profileError);
        setProfile(null);
        setLoadingState('error');
        setLoadingMessage('プロファイル情報の取得に失敗しました');
      } else {
        console.log("fetchUserAndProfile: プロファイル情報を取得:", profileData);
        setProfile(profileData);
        setLoadingState('idle');
        setLoadingMessage('');
      }
    } catch (error) {
      console.error('fetchUserAndProfile: 例外が発生:', error);
      setLoadingState('error');
      setLoadingMessage('予期せぬエラーが発生しました');
    } finally {
      console.log("fetchUserAndProfile: ユーザー情報とプロファイル情報の取得を完了, loading=false に設定");
      setLoading(false); // 常にロード完了時にloadingをfalseに設定
    }
  };

  // ログイン処理
  const signIn = async (email: string, password: string) => {
    try {
      console.log("signIn: ログイン処理を開始:", email);
      setLoading(true); // ログイン処理開始時にloadingをtrueに設定
      setLoadingState('authenticating');
      setLoadingMessage('ログイン中...');
      
      // 既存の認証関連ストレージをすべてクリア
      clearAllAuthStorage();
      
      // タイムアウトを設定
      const signInTimeout = setTimeout(() => {
        console.log("signIn: ログイン処理タイムアウト");
        setLoadingState('error');
        setLoadingMessage('ログイン処理がタイムアウトしました。再試行してください。');
        setLoading(false);
      }, DATA_FETCH_TIMEOUT);
      
      // 直接fetchUserAndProfileを呼び出さず、認証とプロファイル取得を直接行う
      console.log("signIn: Supabaseで認証を実行");
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // タイムアウトをクリア
      clearTimeout(signInTimeout);

      console.log("signIn: 認証結果:", { 
        success: !!data?.user, 
        userId: data?.user?.id || 'なし', 
        error: error?.message || 'なし' 
      });

      if (error) {
        console.error("signIn: ログインエラー:", error.message);
        setLoading(false); // エラー時はloadingをfalseに設定
        setLoadingState('error');
        setLoadingMessage('ログインに失敗しました: ' + error.message);
        return { error };
      }

      if (!data || !data.user) {
        console.error("signIn: ユーザーデータが取得できませんでした");
        setLoading(false);
        setLoadingState('error');
        setLoadingMessage('ユーザーデータが取得できませんでした');
        return { error: new Error("ユーザーデータが取得できませんでした") };
      }

      console.log("signIn: ログイン成功、ユーザー情報:", data.user.id);
      
      // ユーザー情報を設定
      setUser(data.user);
      setLoadingState('loading-profile');
      setLoadingMessage('プロファイル情報を読み込み中...');
      
      try {
        // プロファイル情報取得タイムアウトを設定
        const profileTimeout = setTimeout(() => {
          console.log("signIn: プロファイル取得タイムアウト");
          setLoadingState('error');
          setLoadingMessage('プロファイル情報の取得に時間がかかっています。手動で再読み込みしてください。');
          setLoading(false);
        }, DATA_FETCH_TIMEOUT);
        
        // プロファイル情報を取得（再試行ロジック使用、キャッシュをスキップ）
        const { data: profileData, error: profileError } = await fetchProfileWithRetry(data.user.id, MAX_RETRY_COUNT, true);
        
        // タイムアウトをクリア
        clearTimeout(profileTimeout);

        if (!profileData) {
          console.error('signIn: プロファイル情報の取得に失敗:', profileError);
          setProfile(null);
          setLoadingState('error');
          setLoadingMessage('プロファイル情報の取得に失敗しました。手動で再読み込みしてください。');
        } else {
          console.log("signIn: プロファイル情報を取得:", profileData);
          setProfile(profileData);
          setLoadingState('idle');
          setLoadingMessage('');
        }
      } catch (profileError) {
        console.error("signIn: プロファイル取得中にエラー:", profileError);
        // プロファイル取得に失敗しても認証自体は成功とする
        setLoadingState('error');
        setLoadingMessage('プロファイル情報の取得中にエラーが発生しました。手動で再読み込みしてください。');
      }
      
      console.log("signIn: 認証処理完了、loading状態をfalseに設定");
      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('signIn: ログイン処理中に例外が発生:', error);
      setLoading(false); // 例外発生時もloadingをfalseに設定
      setLoadingState('error');
      setLoadingMessage('ログイン処理中に例外が発生しました');
      return { error };
    }
  };

  // ログアウト処理
  const signOut = async () => {
    try {
      console.log("signOut: ログアウト処理を開始");
      setLoadingState('authenticating');
      setLoadingMessage('ログアウト中...');
      
      // ユーザー状態をクリア
      setUser(null);
      setProfile(null);
      
      // すべての認証関連ストレージをクリア
      clearAllAuthStorage();
      
      // グローバルスコープでログアウト（ローカルもクリア）
      await supabase.auth.signOut({ scope: 'global' }); // globalスコープに変更
      console.log("signOut: ログアウト成功");
      
      setLoadingState('idle');
      setLoadingMessage('');
      
      // 少し待ってからログインページにリダイレクト（ストレージのクリアを完了させるため）
      setTimeout(() => {
        router.push('/login');
      }, 100);
    } catch (error) {
      console.error('Error signing out:', error);
      setLoadingState('error');
      setLoadingMessage('ログアウト中にエラーが発生しました');
      
      // エラーがあっても強制的にストレージをクリアしてログアウト
      clearAllAuthStorage();
      setTimeout(() => {
        router.push('/login');
      }, 100);
    }
  };

  // プロファイル更新処理
  const updateProfile = async (data: Partial<UserProfile>) => {
    try {
      if (!user) return { error: new Error('User not authenticated') };

      setLoadingState('loading-profile');
      setLoadingMessage('プロファイル情報を更新中...');

      // 更新データに必須フィールドを追加
      const updateData = {
        ...data,
        email: user.email, // 既存のメールアドレスを維持
        role: profile?.role || 'regular_user', // 既存のロールを維持、なければデフォルト値
        is_active: profile?.is_active !== undefined ? profile.is_active : true // 既存の状態を維持、なければtrue
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (!error) {
        // プロフィール状態を更新
        const newProfile = profile ? { ...profile, ...updateData } : null;
        setProfile(newProfile);
        
        // キャッシュも更新
        if (newProfile) {
          console.log("AuthContext: プロフィール更新後、キャッシュも更新");
          setCachedProfile(newProfile);
        }
        
        setLoadingState('idle');
        setLoadingMessage('');
      } else {
        console.error('プロファイル更新エラー:', error);
        setLoadingState('error');
        setLoadingMessage('プロファイル更新に失敗しました');
      }

      return { error };
    } catch (error) {
      console.error('Error updating profile:', error);
      setLoadingState('error');
      setLoadingMessage('プロファイル更新中に例外が発生しました');
      return { error };
    }
  };

  const value = {
    user,
    profile,
    loading,
    loadingState,
    loadingMessage,
    manualReload,
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

// すべての認証関連ストレージをクリア
const clearAllAuthStorage = () => {
  try {
    console.log("AuthContext: すべての認証ストレージをクリア");
    
    // Supabase URLからプロジェクトIDを抽出
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectId = supabaseUrl.match(/https:\/\/(.*?)\.supabase\.co/)?.[1] || 'bsgvaomswzkywbiubtjg';
    const storageKey = `sb-${projectId}-auth-token`;
    const codeVerifierKey = `sb-${projectId}-auth-code-verifier`;
    
    // クッキーを削除
    if (typeof window !== 'undefined' && window.Cookies) {
      window.Cookies.remove(storageKey, { path: '/' });
      window.Cookies.remove(codeVerifierKey, { path: '/' });
    }
    
    // ローカルストレージをクリア
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(codeVerifierKey);
      // キャッシュもクリア
      window.localStorage.removeItem(SESSION_CACHE_KEY);
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
    
    // セッションストレージをクリア
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(codeVerifierKey);
    }
    
    console.log("AuthContext: 認証ストレージのクリア完了");
  } catch (e) {
    console.error("AuthContext: ストレージクリア中にエラー:", e);
  }
}; 
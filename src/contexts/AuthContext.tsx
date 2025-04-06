'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Cookies from 'js-cookie';
import { User, Session, PostgrestError, Subscription } from '@supabase/supabase-js';
// import { Profile } from '@/types/index'; // ★ 正しいパスが見つかるまでコメントアウト
import { useToast } from '@/hooks/use-toast';

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
  user: User | null;
  profile: any | null; // ★ 一時的に any に変更
  loading: boolean;
  sessionCheckEnabled: boolean;
  setSessionCheckEnabled: (enabled: boolean) => void;
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
let SESSION_CHECK_ENABLED = true;

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null); // ★ 一時的に any に変更
  const [loading, setLoading] = useState(true);
  const [sessionCheckEnabled, _setSessionCheckEnabled] = useState(SESSION_CHECK_ENABLED);
  const [loadingState, setLoadingState] = useState<'idle' | 'authenticating' | 'loading-profile' | 'error'>('idle');
  const [loadingMessage, setLoadingMessage] = useState<string>('読み込み中...');
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [retryCount, setRetryCount] = useState<number>(0);
  const router = useRouter();
  const { toast } = useToast();

  // ★ 現在のユーザー/プロファイル情報と初回チェック状態を保持するRef
  const userRef = useRef<User | null>(null);
  const profileRef = useRef<any | null>(null); // ★ 一時的に any に変更
  const initialAuthCheckComplete = useRef(false);

  // セッション確認有効フラグのセッター (グローバル変数も更新)
  const setSessionCheckEnabledState = useCallback((enabled: boolean) => {
    console.log("AuthProvider: setSessionCheckEnabledState called with:", enabled);
    _setSessionCheckEnabled(enabled);
    SESSION_CHECK_ENABLED = enabled; // グローバル変数も更新
  }, []);

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
              count: 'exact' as const
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
            if (error && (error.code === 'PGRST116' || error.message?.includes('JSON object') || error.code === '406')) {
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
              const newProfile = {
                id: userData.user.id,
                email: userData.user.email,
                fullname: userData.user.email?.split('@')[0] || 'Unknown',
                role: 'regular_user',
                is_active: true,
                created_at: new Date().toISOString()
              };
              
              console.log("AuthContext: 新規プロファイル作成:", newProfile);
              
              // プロファイル作成APIを呼び出す
              const response = await fetch('/api/user/create-profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(newProfile),
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                console.error("AuthContext: プロファイル作成APIエラー:", errorData);
                throw new Error(errorData.error || 'プロファイル作成に失敗しました');
              }
              
              const createdProfile = await response.json();
              console.log("AuthContext: プロファイル作成成功:", createdProfile);
              
              // プロファイルをキャッシュ
              setCachedProfile(createdProfile);
              isRequestCompleted = true;
              return { data: createdProfile, error: null };
            }
            
            retryAttempt++;
            if (retryAttempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
            }
          } catch (retryError) {
            console.error(`AuthContext: プロファイル取得試行 ${retryAttempt + 1} でエラー:`, retryError);
            retryAttempt++;
            if (retryAttempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
            }
          }
        }
        
        return { data: null, error: new Error('最大試行回数を超えました') };
      })();
      
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      console.error("AuthContext: プロファイル取得処理でエラー:", error);
      return { data: null, error };
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
  }, [user]); // lastActivityを依存配列から削除

  // ★ ユーザー情報とプロファイル情報を取得・更新する関数
  const fetchUserAndProfile = useCallback(async (userId: string) => {
    console.log("AuthContext: fetchUserAndProfile 開始 for user:", userId);
    // この関数内ではローディング状態を設定しない（呼び出し元で管理）
    try {
      // ユーザー情報を再確認 (オプションだが、最新情報を取得する場合)
      const { data: { user: currentUserData }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("AuthContext: ユーザー再確認エラー:", userError);
      } else if (currentUserData && JSON.stringify(currentUserData) !== JSON.stringify(userRef.current)) {
         console.log("AuthContext: ユーザーオブジェクト参照を更新");
         setUser(currentUserData); // stateも更新
         userRef.current = currentUserData; // refも更新
      }

      // プロファイル情報を取得
      console.log("AuthContext: プロファイル取得試行 for user:", userId);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*') // 必要に応じてリレーションも指定: '*, facilities(*)'
        .eq('id', userId)
        .single<any>(); // ★ single<any>() で型を指定 (オプション)

      if (profileError) {
        if (profileError.code !== 'PGRST116') { // "Not found" は通常のエラーとして扱わない場合
          console.error('AuthContext: プロファイル取得エラー:', profileError);
          toast({
            title: "プロファイル取得エラー",
            description: profileError.message,
            variant: "destructive",
          });
        } else {
          console.log('AuthContext: プロファイルが見つかりませんでした (PGRST116)。新規作成が必要かもしれません。');
          // 必要であればここでプロファイル作成APIを呼び出すなどの処理を追加
        }
        setProfile(null);
        profileRef.current = null;
      } else {
        console.log('AuthContext: プロファイル取得成功:', profileData);
        // ★ 取得データが現在のプロファイルと異なる場合のみ更新
        if (JSON.stringify(profileData) !== JSON.stringify(profileRef.current)) {
          setProfile(profileData);
          profileRef.current = profileData;
          console.log("AuthContext: プロファイル情報を更新しました");
        } else {
          console.log("AuthContext: プロファイル情報に変化なし、更新スキップ");
        }
      }
    } catch (error) {
      console.error("AuthContext: fetchUserAndProfile 関数内でエラー:", error);
      setProfile(null); // エラー時はプロファイルもクリア
      profileRef.current = null;
       toast({
         title: "データ取得エラー",
         description: error instanceof Error ? error.message : String(error),
         variant: "destructive",
       });
    }
  }, [toast]); // 依存配列に toast を追加

  // --- 初期化と認証状態監視 ---
  useEffect(() => {
    console.log("AuthContext: 初期化 Effect が実行されました");
    let isMounted = true;

    // ★ 非同期の初期化関数
    const initializeAuth = async () => {
      console.log("AuthContext: 認証初期化を開始");
      setLoading(true); // 初期化開始時にローディング開始
      try {
        // 初回セッション取得
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthContext: 初回セッション取得エラー:", sessionError);
        }

        if (isMounted) {
          if (session) {
            console.log("AuthContext: 初期セッションあり");
            // ★ 以前のユーザーと違うか、ユーザーがいない場合のみ fetch
            if (!userRef.current || userRef.current.id !== session.user.id) {
              console.log("AuthContext: 初期ユーザー設定 & プロファイル取得実行");
              setUser(session.user);
              userRef.current = session.user;
              await fetchUserAndProfile(session.user.id);
            } else {
              console.log("AuthContext: 初期ユーザー同じ、プロファイル取得スキップ");
              // ユーザーオブジェクトの参照だけ更新する場合
              setUser(session.user); // stateは更新しておく
              userRef.current = session.user; // refも更新
              // profileは既存のものを維持 (profileRef.current)
              setProfile(profileRef.current);
            }
          } else {
            console.log("AuthContext: 初期セッションなし");
            setUser(null);
            setProfile(null);
            userRef.current = null;
            profileRef.current = null;
          }
        }
      } catch (error) {
        console.error("AuthContext: 認証初期化中にエラー発生:", error);
        if (isMounted) {
          setUser(null);
          setProfile(null);
          userRef.current = null;
          profileRef.current = null;
        }
      } finally {
        if (isMounted) {
          initialAuthCheckComplete.current = true; // ★ 初回チェック完了フラグを立てる
          setLoading(false); // ★ 初期化完了時にローディング終了
          console.log("AuthContext: 初期化完了 (loading=false)");
        }
      }
    };

    initializeAuth();

    // ★ 認証状態の変更を監視
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`AuthContext: onAuthStateChange イベント: ${event}, セッション有無: ${!!session}`);

        // ★ isMounted チェックを追加
        if (!isMounted) {
          console.log("AuthContext: Component unmounted, skipping auth state change.");
          return;
        }

        // ★ 初回チェック完了前に他のイベントが来た場合、またはセッションがない場合は基本的に何もしないことが多い
        //    ただし、SIGNED_OUT は処理する必要がある
        if (!initialAuthCheckComplete.current && event !== 'INITIAL_SESSION') {
          console.log(`AuthContext: 初回チェック完了前 (${event}) - 処理スキップ`);
          return;
        }
        if (event === 'INITIAL_SESSION') {
           // initializeAuth で処理済みのはずだが、念のためローディング解除
           if (loading) setLoading(false);
           return;
        }


        const currentUserId = userRef.current?.id;
        const newUserId = session?.user?.id;

        if (event === 'SIGNED_IN') {
          if (newUserId && newUserId !== currentUserId) {
            // ユーザーが実際に切り替わった場合のみデータ取得
            console.log(`AuthContext: SIGNED_IN - ユーザー変更 (${currentUserId} -> ${newUserId})。データ取得実行`);
            setLoading(true);
            setUser(session!.user);
            userRef.current = session!.user;
            await fetchUserAndProfile(newUserId);
            setLoading(false);
          } else if (newUserId && newUserId === currentUserId) {
            // ユーザーIDは同じだがイベント発生 (タブアクティブ化など)
            console.log(`AuthContext: SIGNED_IN - ユーザー同じ (${newUserId})。ユーザーオブジェクト更新のみ`);
            setUser(session!.user); // ユーザーオブジェクト参照の更新は行う
            userRef.current = session!.user;
            // プロファイルは再取得しない
          } else if (!newUserId) {
             console.warn(`AuthContext: SIGNED_IN イベントだが session.user が存在しない`);
             setUser(null);
             setProfile(null);
             userRef.current = null;
             profileRef.current = null;
             setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log(`AuthContext: SIGNED_OUT 検出`);
          setUser(null);
          setProfile(null);
          userRef.current = null;
          profileRef.current = null;
          setLoading(false); // 必要なら
        } else if (event === 'TOKEN_REFRESHED') {
          console.log(`AuthContext: TOKEN_REFRESHED`);
          if (session) {
              console.log(`AuthContext: セッションあり、ユーザーオブジェクト更新のみ`);
              // 新しいセッション情報でユーザー状態を更新する (プロファイルは取得しない)
              setUser(session.user);
              userRef.current = session.user;
          } else {
              console.warn(`AuthContext: TOKEN_REFRESHED イベントだがセッションがない、サインアウトとして扱う`);
               setUser(null);
               setProfile(null);
               userRef.current = null;
               profileRef.current = null;
               setLoading(false);
          }
        } else if (event === 'USER_UPDATED') {
          console.log(`AuthContext: USER_UPDATED`);
           if (session) {
              console.log(`AuthContext: ユーザーオブジェクト更新、プロファイルも再取得`);
              // USER_UPDATEDの場合はプロファイルも変更されている可能性があるため再取得
              setLoading(true);
              setUser(session.user);
              userRef.current = session.user;
              await fetchUserAndProfile(session.user.id);
              setLoading(false);
           }
        } else {
          console.log(`AuthContext: その他のイベント (${event})`);
          // 必要に応じて他のイベント (PASSWORD_RECOVERY など) の処理を追加
        }
      }
    );

    // クリーンアップ関数
    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
      console.log("AuthContext: リスナー解除、クリーンアップ完了");
    };
  }, [fetchUserAndProfile]); // fetchUserAndProfile を依存配列に追加

  // グローバル変数と同期するEffect (オプション、もしあれば)
  useEffect(() => {
      const intervalId = setInterval(() => {
          if (sessionCheckEnabled !== SESSION_CHECK_ENABLED) {
              console.log("Syncing global session check state:", SESSION_CHECK_ENABLED);
              setSessionCheckEnabledState(SESSION_CHECK_ENABLED);
          }
      }, 1000); // 1秒ごとに同期チェック
      return () => clearInterval(intervalId);
  }, [sessionCheckEnabled]);

  // アクティビティログを記録する関数
  const logUserActivity = async (actionType: string, actionDetails: any = {}) => {
    try {
      if (!user) {
        console.error('アクティビティログ: ユーザーが認証されていません');
        return;
      }

      const logData = {
        user_id: user.id,
        action_type: actionType,
        action_details: actionDetails,
        performed_by: user.id,
        created_at: new Date().toISOString()
      };

      console.log('アクティビティログ記録:', logData);

      const { error } = await supabase
        .from('user_activity_logs')
        .insert(logData);

      if (error) {
        console.error('アクティビティログ記録エラー:', error);
      }
    } catch (error) {
      console.error('アクティビティログ記録中に例外発生:', error);
    }
  };

  // ログイン処理を修正
  const signIn = async (email: string, password: string) => {
    try {
      console.log("signIn: ログイン処理を開始:", email);
      setLoading(true);
      setLoadingState('authenticating');
      setLoadingMessage('ログイン中...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("signIn: ログインエラー:", error.message);
        setLoading(false);
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
        // プロファイル情報を取得
        const { data: profileData, error: profileError } = await fetchProfileWithRetry(data.user.id, MAX_RETRY_COUNT, true);

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
          
          // ログインアクティビティを記録
          await logUserActivity('login', {
            email: email,
            success: true
          });
        }
      } catch (profileError) {
        console.error("signIn: プロファイル取得中にエラー:", profileError);
        setLoadingState('error');
        setLoadingMessage('プロファイル情報の取得中にエラーが発生しました。手動で再読み込みしてください。');
      }
      
      setLoading(false);
      return { error: null };
    } catch (error) {
      console.error('signIn: ログイン処理中に例外が発生:', error);
      setLoading(false);
      setLoadingState('error');
      setLoadingMessage('ログイン処理中に例外が発生しました');
      return { error };
    }
  };

  // ログアウト処理を修正
  const signOut = async () => {
    try {
      console.log("signOut: ログアウト処理を開始");
      setLoadingState('authenticating');
      setLoadingMessage('ログアウト中...');
      
      // ログアウトアクティビティを記録
      if (user) {
        await logUserActivity('logout', {
          success: true
        });
      }
      
      // ユーザー状態をクリア
      setUser(null);
      setProfile(null);
      
      // すべての認証関連ストレージをクリア
      clearAllAuthStorage();
      
      // グローバルスコープでログアウト
      await supabase.auth.signOut({ scope: 'global' });
      console.log("signOut: ログアウト成功");
      
      setLoadingState('idle');
      setLoadingMessage('');
      
      // 少し待ってからログインページにリダイレクト
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
    sessionCheckEnabled,
    setSessionCheckEnabled: setSessionCheckEnabledState,
    loadingState,
    loadingMessage,
    manualReload,
    signIn,
    signOut,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

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
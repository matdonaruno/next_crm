import { supabase } from '@/lib/supabaseClient';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  body?: any;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  redirectOnAuthError?: boolean;
}

/**
 * 認証済みAPIリクエストを送信する共通関数
 * 自動的に認証ヘッダーを付加し、認証エラーを統一的に処理します
 */
export async function fetchApi<T = any>(url: string, options: ApiOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    skipAuth = false,
    redirectOnAuthError = true,
  } = options;

  try {
    // 認証トークンを取得（skipAuthがfalseの場合のみ）
    let authHeaders = {};
    if (!skipAuth) {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (redirectOnAuthError && typeof window !== 'undefined') {
          console.error('API呼び出しエラー: 認証セッションがありません');
          
          // 現在のページをreturnUrlとして保存してログインページへリダイレクト
          const returnUrl = encodeURIComponent(window.location.pathname);
          window.location.href = `/login?returnUrl=${returnUrl}`;
        }
        throw new Error('認証が必要です');
      }
      
      authHeaders = {
        'Authorization': `Bearer ${session.access_token}`,
      };
    }

    // リクエストの構築
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers,
      },
      credentials: 'include',
    };

    // リクエストボディの追加（GETまたはHEADメソッド以外）
    const methodsWithoutBody = ['GET', 'HEAD'];
    if (body && !methodsWithoutBody.includes(method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // リクエストの実行
    const response = await fetch(url, fetchOptions);

    // HTTP 401/403エラーの処理（認証エラー）
    if (response.status === 401 || response.status === 403) {
      console.error(`API認証エラー: ${response.status} - ${response.statusText}`);
      
      if (redirectOnAuthError && typeof window !== 'undefined') {
        // セッション切れなどの場合、ログインページにリダイレクト
        const returnUrl = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?returnUrl=${returnUrl}`;
      }
      
      throw new Error('認証エラー: 再ログインが必要です');
    }

    // その他のHTTPエラー
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `APIエラー: ${response.status} ${response.statusText}`
      );
    }

    // 空のレスポンスボディを処理
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    // レスポンスをJSONとしてパース
    return await response.json();
  } catch (error) {
    console.error('API呼び出し中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * 認証済みGETリクエスト
 */
export function get<T = any>(url: string, options: Omit<ApiOptions, 'method'> = {}) {
  return fetchApi<T>(url, { ...options, method: 'GET' });
}

/**
 * 認証済みPOSTリクエスト
 */
export function post<T = any>(url: string, body: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return fetchApi<T>(url, { ...options, method: 'POST', body });
}

/**
 * 認証済みPUTリクエスト
 */
export function put<T = any>(url: string, body: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return fetchApi<T>(url, { ...options, method: 'PUT', body });
}

/**
 * 認証済みDELETEリクエスト
 */
export function del<T = any>(url: string, options: Omit<ApiOptions, 'method'> = {}) {
  return fetchApi<T>(url, { ...options, method: 'DELETE' });
}

/**
 * 認証済みPATCHリクエスト
 */
export function patch<T = any>(url: string, body: any, options: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return fetchApi<T>(url, { ...options, method: 'PATCH', body });
} 
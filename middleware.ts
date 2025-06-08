// middleware.ts — 事前リダイレクトでチラつきをゼロにする Edge Middleware
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './src/utils/supabase/middleware'
import type { NextFetchEvent } from 'next/server'

/* 1. 適用対象 */
export const config = {
  // _next/static など Next.js が内部で配信するファイルは除外
  matcher: ['/((?!_next|favicon.ico|sw.js).*)'],
}

/* 2. 公開・例外ルート定義 */
const PUBLIC_PATHS = ['/login', '/direct-login', '/register']
const NO_DEPARTMENT_PATHS = ['/depart']

/* 3. ユーティリティ */
/** JWT を簡易デコードして payload を返す（署名検証は行わない） */
function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T | null {
  try {
    const payloadPart = jwt.split('.')[1]
    // Edge Runtime では atob が使える
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/* 署名検証までは行わず、exp / nbf / iss など最低限を確認したい場合はここで実装 */
function isJwtValid(jwt?: string): boolean {
  if (!jwt) return false
  const payload = decodeJwtPayload<{ exp?: number; nbf?: number }>(jwt)
  if (!payload) return false

  const now = Math.floor(Date.now() / 1000)
  if (payload.nbf && now < payload.nbf) return false
  if (payload.exp && now > payload.exp) return false
  return true
}

/* 4. メイン処理 */
export async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const res = await updateSession(req, ev)
  const { pathname } = req.nextUrl
  
  // Supabase SSRが設定するクッキーを探す
  const cookieStore = req.cookies
  let token = null
  
  // Supabaseのauth-tokenクッキーを探す
  for (const [name, cookie] of cookieStore) {
    if (name.includes('auth-token') && cookie.value) {
      const jwt = cookie.value.split('.')[0] ? cookie.value : null
      if (jwt && isJwtValid(jwt)) {
        token = jwt
        break
      }
    }
  }

  /* 4‑1. 公開ページはそのまま通す */
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return res
  }

  /* 4‑2. JWT が無い / 無効 → /login */
  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = '' // 検索パラメータを消す
    return NextResponse.redirect(url)
  }

  /* 4‑3. facility_id 必須判定 - 一時的に無効化 */
  // JWTペイロードにfacility_idが含まれるかどうかは実装によるため、
  // AuthGateで処理させる
  /*
  const payload = decodeJwtPayload<{ facility_id?: string | null }>(token!)
  const hasFacility = Boolean(payload?.facility_id)

  if (!hasFacility && !NO_DEPARTMENT_PATHS.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone()
    url.pathname = '/depart'
    url.search = ''
    return NextResponse.redirect(url)
  }
  */

  /* 4‑4. 必要に応じて Authorization をヘッダーへ */
  if (token) {
    res.headers.set('Authorization', `Bearer ${token}`)
  }

  return res
}

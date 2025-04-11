import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names with Tailwind CSS classes
 * Using clsx for conditional classes and twMerge to handle conflicting Tailwind classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 日本時間（JST）のタイムスタンプを生成する関数
 * @returns {string} ISO形式の日本時間タイムスタンプ
 */
export function getJstTimestamp(): string {
  // 現在のUTC時間を取得し、日本時間（UTC+9時間）に変換
  const now = new Date();
  const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return jstDate.toISOString();
}

/**
 * 日本時間（JST）の日付部分だけを取得する関数（YYYY-MM-DD形式）
 * @returns {string} YYYY-MM-DD形式の日本時間の日付
 */
export function getJstDateString(): string {
  return getJstTimestamp().split('T')[0];
}

/**
 * 日時文字列を統一されたフォーマットで表示するための関数
 * サーバー/クライアント間のハイドレーションエラーを防ぐため、一貫した表示方法を使用
 * @param dateString - ISO形式の日時文字列
 * @returns 整形された日時表示（YYYY/MM/DD HH:MM形式）
 */
export function formatDateForDisplay(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    // UTCのままの日時を取得
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    
    // yyyy/MM/dd HH:mm形式で返す（UTCのまま、秒を切り捨て）
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } catch (e) {
    console.error('Date formatting error:', e);
    return dateString; // フォールバック
  }
}

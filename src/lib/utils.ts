import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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

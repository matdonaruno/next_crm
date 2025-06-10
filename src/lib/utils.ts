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

/**
 * 日時文字列をJST（日本標準時）で統一的にフォーマットする
 * @param dateString ISO形式の日時文字列またはタイムスタンプ
 * @param options フォーマットオプション
 * @returns JST表示の日時文字列
 */
export function formatJSTDateTime(
  dateString: string | number | Date | null | undefined,
  options: {
    showSeconds?: boolean;
    dateOnly?: boolean;
    timeOnly?: boolean;
    format?: 'slash' | 'japanese' | 'iso';
  } = {}
): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const {
      showSeconds = false,
      dateOnly = false,
      timeOnly = false,
      format = 'slash'
    } = options;
    
    // JSTで表示（Asia/Tokyoタイムゾーンを明示的に指定）
    const jstOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: timeOnly || (!dateOnly) ? '2-digit' : undefined,
      minute: timeOnly || (!dateOnly) ? '2-digit' : undefined,
      second: (timeOnly || (!dateOnly)) && showSeconds ? '2-digit' : undefined,
      hour12: false
    };
    
    if (format === 'japanese') {
      return date.toLocaleString('ja-JP', {
        ...jstOptions,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    
    if (format === 'iso') {
      return date.toLocaleString('sv-SE', jstOptions); // ISO-like format
    }
    
    // デフォルト: slash format (yyyy/MM/dd HH:mm:ss)
    return date.toLocaleString('ja-JP', jstOptions);
    
  } catch (e) {
    console.error('JST Date formatting error:', e);
    return String(dateString);
  }
}

/**
 * 短縮版：日時をJSTで表示 (yyyy/MM/dd HH:mm)
 */
export function formatJSTDateTimeShort(dateString: string | number | Date | null | undefined): string {
  return formatJSTDateTime(dateString);
}

/**
 * 短縮版：日付のみをJSTで表示 (yyyy/MM/dd)
 */
export function formatJSTDate(dateString: string | number | Date | null | undefined): string {
  return formatJSTDateTime(dateString, { dateOnly: true });
}

/**
 * 短縮版：時刻のみをJSTで表示 (HH:mm)
 */
export function formatJSTTime(dateString: string | number | Date | null | undefined): string {
  return formatJSTDateTime(dateString, { timeOnly: true });
}

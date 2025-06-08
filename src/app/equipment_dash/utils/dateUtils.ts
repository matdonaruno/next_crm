/* -------------------------------------------------------------
 *  Equipment Dashboard ─ 日付・頻度関連ユーティリティ
 * ----------------------------------------------------------- */
import { format, addMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import holidays from '@holiday-jp/holiday_jp';

export const formatDateTime = (timestamp: string | null): string => {
  if (!timestamp) return '未実施';
  return new Date(timestamp).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const frequencyToJapanese = (frequency: string): string => {
  switch (frequency) {
    case 'daily':
      return '毎日';
    case 'weekly':
      return '毎週';
    case 'monthly':
      return '毎月';
    case 'as_needed':
      return '必要時';
    default:
      return frequency;
  }
};

/* 期限超過判定 */
export const isCheckOverdue = (last: string | null, freq: string): boolean => {
  if (!last) return true;
  const now = Date.now();
  const prev = new Date(last).getTime();
  const days = Math.floor((now - prev) / 86_400_000); // 1000*60*60*24

  return (
    (freq === 'daily' && days > 1) ||
    (freq === 'weekly' && days > 7) ||
    (freq === 'monthly' && days > 30)
  );
};

/* 期間内に完了しているか */
export const isCurrentPeriodCompleted = (last: string | null, freq: string): boolean => {
  if (!last) return false;
  const lastDate = new Date(last);
  const now = new Date();

  switch (freq) {
    case 'daily':
      return format(now, 'yyyy-MM-dd') === format(lastDate, 'yyyy-MM-dd');
    case 'weekly': {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 月曜
      return lastDate >= monday;
    }
    case 'monthly':
      return lastDate.getFullYear() === now.getFullYear() && lastDate.getMonth() === now.getMonth();
    case 'as_needed':
      return true;
    default:
      return false;
  }
};

/* 日本の祝日関連 */
export const isJapaneseHoliday = (date: Date): boolean => holidays.isHoliday(date);

export const getHolidayName = (date: Date): string | null => {
  const h = holidays.between(date, date)[0];
  return h ? h.name : null;
};

/* 現在期間のテキスト */
export const getCurrentPeriodInfo = (freq: string): { label: string; period: string } => {
  const now = new Date();
  const todayFmt = format(now, 'yyyy/MM/dd');
  const weekFmt = format(now, 'E', { locale: ja });

  switch (freq) {
    case 'daily':
      return { label: '本日', period: `${todayFmt} (${weekFmt})` };
    case 'weekly': {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = addMonths(monday, 0);
      sunday.setDate(monday.getDate() + 6);
      return {
        label: '今週',
        period: `${format(monday, 'yyyy/MM/dd')} (${format(monday, 'E', { locale: ja })}) 〜 ${format(
          sunday,
          'yyyy/MM/dd'
        )} (${format(sunday, 'E', { locale: ja })})`,
      };
    }
    case 'monthly': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        label: '今月',
        period: `${format(first, 'yyyy/MM/dd')} (${format(first, 'E', { locale: ja })}) 〜 ${format(
          last,
          'yyyy/MM/dd'
        )} (${format(last, 'E', { locale: ja })})`,
      };
    }
    default:
      return { label: '必要時', period: '必要に応じて実施' };
  }
};

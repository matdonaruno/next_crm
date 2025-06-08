// src/app/temperature/weekly-verification/page.tsx
import { redirect } from 'next/navigation';
import { WeeklyVerificationClient } from '@/components/temperature/weekly-verification-client';
import { newSupabase } from '@/lib/supabaseRoute';

/** ISO-8601 週番号 (1-53) を返す */
function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;            // 月=1 … 日=7
  d.setUTCDate(d.getUTCDate() + 4 - day);    // その週の木曜日
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.floor(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7) + 1;
}

/** `YYYY-WW` 形式へフォーマット */
function formatYearWeek(date: Date): string {
  const year = date.getUTCFullYear();
  const week = String(getIsoWeek(date)).padStart(2, '0');
  return `${year}-${week}`; // 例: 2025-18
}

/** `YYYY-WW` → その週の開始・終了日 (`YYYY-MM-DD`) を返す */
function parseWeekRange(yearWeek: string): { start: string; end: string } {
  const [y, w] = yearWeek.split('-').map((v) => parseInt(v, 10));
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const isoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const mon1 = new Date(jan4);
  mon1.setUTCDate(jan4.getUTCDate() - (isoDay - 1));
  const start = new Date(mon1);
  start.setUTCDate(mon1.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

/** Cookie を読むので動的ページ */
export const dynamic = 'force-dynamic';

export default async function WeeklyVerificationPage({
  searchParams,
}: {
  searchParams: {
    department?: string;
    departmentId?: string;
    facilityId?: string;
    week?: string;
    weekStart?: string;
    weekEnd?: string;
  };
}) {
  // 認証チェック
  const supabase = newSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect('/login');

  // パラメータ整理
  const departmentId = searchParams.departmentId ?? '';
  const facilityId =
    searchParams.facilityId ??
    ((user.user_metadata?.facility_id as string | undefined) ?? '');
  if (!departmentId || !facilityId) redirect('/temperature');

  const departmentName = searchParams.department ?? '';
  const backHref = `/temperature?department=${encodeURIComponent(
    departmentName ?? ''
  )}&departmentId=${departmentId ?? ''}`;

  // 週指定 (未指定なら今週)
  const targetWeek = searchParams.week ?? formatYearWeek(new Date());

  // 週開始・終了日を確定
  let weekStart = searchParams.weekStart;
  let weekEnd = searchParams.weekEnd;
  if (!weekStart || !weekEnd) {
    const range = parseWeekRange(targetWeek);
    weekStart = range.start;
    weekEnd = range.end;
  }

  // --- サーバーで一度だけデータを取っておきたい場合はここで取得し、
  //     そのうえで client コンポーネントに渡す実装もアリです ---
  //     ただし、WeeklyVerificationClientProps に合う形でしか渡せません。

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4">
        <WeeklyVerificationClient
          departmentId={departmentId}
          facilityId={facilityId}
          departmentName={departmentName}
          weekStart={weekStart!}
          weekEnd={weekEnd!}
          userId={user.id}
          backHref={backHref}
        />
      </div>
    </div>
  );
}

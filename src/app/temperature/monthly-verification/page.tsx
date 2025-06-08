// src/app/temperature/monthly-verification/page.tsx

import { redirect } from 'next/navigation';
import { MonthlyVerificationClient } from '@/components/temperature/monthly-verification-client';
import { newSupabase } from '@/lib/supabaseRoute';

export const dynamic = 'force-dynamic';

type Query = {
  department?: string;
  departmentId?: string;
  facilityId?: string;
  yearMonth?: string; // YYYY-MM
};

export default async function MonthlyVerificationPage({
  searchParams,
}: {
  searchParams: Query;
}) {
  // ───────────── 認証 ─────────────
  const supabase = newSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    redirect('/login');
  }

  // ───────────── 管理権限チェック ─────────────
  const { data: profileData, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profErr || !profileData) {
    redirect('/login');
  }

  // Supabase の user_role enum は "superuser" | "facility_admin" | "approver" | "regular_user"
  const role = profileData.role;
  const isAdmin = role === 'superuser' || role === 'facility_admin';
  if (!isAdmin) {
    redirect('/temperature');
  }

  // ───────────── パラメータ整理 ─────────────
  const departmentId   = searchParams.departmentId ?? '';
  const facilityId     = searchParams.facilityId   ?? '';
  const departmentName = searchParams.department ?? '';
  const yearMonth      = searchParams.yearMonth    ?? '';

  if (!departmentId || !facilityId) {
    redirect('/temperature');
  }

  const backHref = `/temperature?department=${encodeURIComponent(
    departmentName ?? ''
  )}&departmentId=${departmentId ?? ''}`;

  // ───────────── 画面 ─────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4">
        <MonthlyVerificationClient
          departmentId={departmentId}
          facilityId={facilityId}
          departmentName={departmentName}
          yearMonth={yearMonth}
          userId={user.id}
          isAdmin={isAdmin}
          backHref={backHref}
        />
      </div>
    </div>
  );
}

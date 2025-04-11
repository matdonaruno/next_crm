import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { WeeklyVerificationClient } from '@/components/temperature/weekly-verification-client';

export default async function WeeklyVerificationPage({
  searchParams,
}: {
  searchParams: { 
    department?: string; 
    departmentId?: string;
    facilityId?: string;
    weekStart?: string; 
    weekEnd?: string; 
  };
}) {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const departmentId = searchParams.departmentId || '';
  const facilityId = searchParams.facilityId || '';
  const departmentName = searchParams.department || '部署';
  const weekStart = searchParams.weekStart || '';
  const weekEnd = searchParams.weekEnd || '';

  if (!departmentId || !facilityId) {
    redirect('/temperature');
  }

  const backHref = `/temperature?departmentId=${departmentId}&departmentName=${encodeURIComponent(departmentName)}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4">
        <WeeklyVerificationClient
          departmentId={departmentId}
          facilityId={facilityId}
          departmentName={departmentName}
          weekStart={weekStart}
          weekEnd={weekEnd}
          userId={user.id}
          backHref={backHref}
        />
      </div>
    </div>
  );
} 
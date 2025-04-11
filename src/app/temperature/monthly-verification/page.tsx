import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MonthlyVerificationClient } from '@/components/temperature/monthly-verification-client';

export default async function MonthlyVerificationPage({
  searchParams,
}: {
  searchParams: { 
    department?: string; 
    departmentId?: string;
    facilityId?: string;
    yearMonth?: string; // YYYY-MM形式で年月を指定
  };
}) {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ユーザーの権限確認
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('プロフィール取得エラー:', profileError);
    redirect('/login');
  }

  // 管理者権限チェック（管理者のみアクセス可能）
  const isAdmin = profile.role === 'admin' || profile.role === 'facility_admin' || profile.role === 'superuser';
  if (!isAdmin) {
    redirect('/temperature'); // 権限がない場合は温度管理画面にリダイレクト
  }

  const departmentId = searchParams.departmentId || '';
  const facilityId = searchParams.facilityId || '';
  const departmentName = searchParams.department || '部署';
  const yearMonth = searchParams.yearMonth || '';

  if (!departmentId || !facilityId) {
    redirect('/temperature');
  }

  // 戻り先のURLを設定
  const backHref = `/temperature?departmentId=${departmentId}&departmentName=${encodeURIComponent(departmentName)}`;

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
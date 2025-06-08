'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseBrowser';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppHeader } from '@/components/ui/app-header';
import { formatDateForDisplay } from '@/lib/utils';
import type { Database } from '@/types/supabase';

type Profiles = Database['public']['Tables']['profiles']['Row'];
type TemperatureRecordDetail = Database['public']['Tables']['temperature_record_details']['Row'];
type MonthlyVerificationInsert = Database['public']['Tables']['monthly_temperature_verifications']['Insert'];
type MonthlyVerificationUpdate = Database['public']['Tables']['monthly_temperature_verifications']['Update'];

interface TemperatureRecordItem {
  id: string;
  created_at: string | null;
  is_auto_recorded: boolean | null;
  details: TemperatureRecordDetail[];
}

interface MonthlyStatus {
  yearMonth: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedByUserId?: string | null;
  comments: string | null;
  hasAnomalies: boolean;
}

interface MonthlyVerificationClientProps {
  departmentId: string;
  facilityId: string;
  departmentName: string;
  userId: string;
  isAdmin: boolean;
  yearMonth?: string;
  backHref?: string;
}

export function MonthlyVerificationClient({
  departmentId,
  facilityId,
  departmentName,
  userId,
  isAdmin,
  yearMonth,
  backHref = '/temperature'
}: MonthlyVerificationClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [temperatureData, setTemperatureData] = useState<TemperatureRecordItem[]>([]);
  const [comments, setComments] = useState('');
  const [hasAnomalies, setHasAnomalies] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<MonthlyStatus | null>(null);
  const [userProfile, setUserProfile] = useState<Profiles | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    yearMonth ? parseISO(`${yearMonth}-01`) : new Date()
  );
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) {
      router.push(backHref);
      return;
    }

    const loadData = async () => {
      setLoading(true);

      try {
        // プロフィール取得
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (profileError) throw profileError;
        setUserProfile(profileData);

        const formattedYearMonth = format(selectedMonth, 'yyyy-MM');
        const monthStart = startOfMonth(selectedMonth);
        const monthEnd = endOfMonth(selectedMonth);

        // ——— 温度データ取得 ———
        const { data: rawTempData, error: tempError } = await supabase
          .from('temperature_records')
          .select(`
            id,
            created_at,
            is_auto_recorded,
            temperature_record_details (*)
          `)
          .eq('department_id', departmentId)
          .eq('facility_id', facilityId)
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString())
          .order('created_at', { ascending: false });
        if (tempError) throw tempError;

        const formatted = (rawTempData || []).map(r => ({
          id: r.id,
          created_at: r.created_at,
          is_auto_recorded: r.is_auto_recorded,
          details: r.temperature_record_details
        }));
        setTemperatureData(formatted);

        // ——— 月次確認状況取得 ———
        const { data: verificationData, error: verificationError } = await supabase
          .from('monthly_temperature_verifications')
          .select('*, verified_by_profile:profiles(id, fullname)')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .eq('year_month', formattedYearMonth)
          .single();
        if (verificationError && verificationError.code !== 'PGRST116') {
          throw verificationError;
        }

        if (verificationData) {
          setVerificationStatus({
            yearMonth: formattedYearMonth,
            isVerified: true,
            verifiedAt: verificationData.verified_at,
            verifiedBy: verificationData.verified_by_profile?.fullname || '不明',
            verifiedByUserId: verificationData.verified_by,
            comments: verificationData.comments,
            hasAnomalies: verificationData.has_anomalies
          });
          setComments(verificationData.comments || '');
          setHasAnomalies(verificationData.has_anomalies || false);
        } else {
          setVerificationStatus({
            yearMonth: formattedYearMonth,
            isVerified: false,
            verifiedAt: null,
            verifiedBy: null,
            comments: null,
            hasAnomalies: false
          });
        }
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        toast({
          title: 'エラー',
          description: 'データの読み込み中にエラーが発生しました。',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [departmentId, facilityId, userId, selectedMonth, isAdmin, backHref, router, toast]);

  const handleVerifyMonth = async () => {
    if (!verificationStatus || saving || !userProfile) return;
    setSaving(true);

    try {
      const { yearMonth } = verificationStatus;
      const { data: existing, error: checkError } = await supabase
        .from('monthly_temperature_verifications')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('department_id', departmentId)
        .eq('year_month', yearMonth)
        .maybeSingle();
      if (checkError) throw checkError;

      if (existing) {
        const updatePayload: MonthlyVerificationUpdate = {
          comments,
          has_anomalies: hasAnomalies,
          verified_at: new Date().toISOString(),
          verified_by: userId
        };
        const { error: updateError } = await supabase
          .from('monthly_temperature_verifications')
          .update(updatePayload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const insertPayload: MonthlyVerificationInsert = {
          facility_id: facilityId,
          department_id: departmentId,
          year_month: yearMonth,
          comments,
          has_anomalies: hasAnomalies,
          verified_at: new Date().toISOString(),
          verified_by: userId
        };
        const { error: insertError } = await supabase
          .from('monthly_temperature_verifications')
          .insert(insertPayload);
        if (insertError) throw insertError;
      }

      setVerificationStatus(prev => prev && ({
        ...prev,
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: userProfile.fullname || '現在のユーザー',
        verifiedByUserId: userId,
        comments,
        hasAnomalies
      }));

      toast({
        title: '確認完了',
        description: `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の温度確認を記録しました。`
      });
    } catch (error) {
      console.error('確認処理エラー:', error);
      toast({
        title: 'エラー',
        description: '月次確認の処理中にエラーが発生しました。',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreviousMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));

  if (loading) {
    return (
      <>
        <AppHeader title={`${departmentName} - 月次温度確認`} showBackButton />
        <div className="flex justify-center items-center h-64">
          <div className="h-10 w-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-2 text-pink-700">データを読み込んでいます...</span>
        </div>
      </>
    );
  }

  if (!verificationStatus) {
    return (
      <>
        <AppHeader title={`${departmentName} - 月次温度確認`} showBackButton />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">データが見つかりません</h2>
          <p className="text-yellow-600">指定された月のデータが見つかりませんでした。別の月を選択してください。</p>
          <Button className="mt-4" onClick={() => router.push(backHref)}>
            温度管理ページに戻る
          </Button>
        </div>
      </>
    );
  }

  const formattedMonthText = format(selectedMonth, 'yyyy年M月', { locale: ja });

  return (
    <>
      <AppHeader title={`${departmentName} - 月次温度確認`} showBackButton />
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-gray-50 rounded-t-lg">
            <CardTitle className="text-2xl font-bold text-primary flex items-center justify-between">
              <span className="flex items-center">
                <Calendar className="h-6 w-6 mr-2 text-primary" />
                {formattedMonthText}の温度記録確認
              </span>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
                  前月
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextMonth}
                  disabled={new Date(selectedMonth) > new Date()}
                >
                  翌月
                </Button>
              </div>
            </CardTitle>
            <p className="text-gray-600">
              {departmentName}の{formattedMonthText}の温度記録の月次確認
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            {verificationStatus.isVerified ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center text-green-700 mb-2">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span className="font-semibold">確認済み</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  確認日時: {verificationStatus.verifiedAt ? formatDateForDisplay(verificationStatus.verifiedAt) : '不明'}
                </p>
                <p className="text-sm text-gray-600">
                  確認者: {verificationStatus.verifiedBy}
                </p>
                {verificationStatus.hasAnomalies && (
                  <div className="mt-2 flex items-center text-amber-600">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    <span>異常あり</span>
                  </div>
                )}
                {verificationStatus.comments && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">コメント:</p>
                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{verificationStatus.comments}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  {departmentName}の{formattedMonthText}の温度記録を確認してください。問題がなければ「確認完了」ボタンをクリックしてください。
                </p>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">期間内の温度記録</h3>
              {temperatureData.length === 0 ? (
                <p className="text-gray-500 italic">この期間の温度記録はありません。</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日時</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">温度</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">種別</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {temperatureData.slice(0, 50).map(record => {
                        const temps = record.details
                          .filter(d => d.value != null)
                          .map(d => d.value as number);
                        const avg = temps.length
                          ? temps.reduce((a, b) => a + b, 0) / temps.length
                          : 0;
                        return (
                          <tr key={record.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {formatDateForDisplay(record.created_at!)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {avg.toFixed(1)}℃
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {record.is_auto_recorded ? (
                                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">自動</span>
                              ) : (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">手動</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {temperatureData.length > 50 && (
                    <div className="p-2 text-center text-gray-500 text-sm">
                      表示件数制限のため、最新50件のみ表示しています。（全{temperatureData.length}件）
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="anomalies"
                  checked={hasAnomalies}
                  onCheckedChange={setHasAnomalies}
                  disabled={verificationStatus.isVerified}
                />
                <Label htmlFor="anomalies" className="text-gray-700">
                  異常あり
                </Label>
              </div>
              <div>
                <Label htmlFor="comments" className="text-gray-700 mb-2 block">
                  コメント
                </Label>
                <Textarea
                  id="comments"
                  placeholder="コメントを入力..."
                  className="w-full"
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  disabled={verificationStatus.isVerified}
                />
              </div>
              <div className="pt-4 flex justify-between">
                <Button variant="outline" onClick={() => router.push(backHref)}>
                  戻る
                </Button>
                {!verificationStatus.isVerified && (
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white"
                    onClick={handleVerifyMonth}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    確認完了
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

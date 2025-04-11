'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Loader2, Calendar, FileCheck } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AppHeader } from '@/components/ui/app-header';
import { formatDateForDisplay } from '@/lib/utils';

interface MonthlyStatus {
  yearMonth: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
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

interface TemperatureRecord {
  id: string;
  created_at: string;
  temperature: number;
  recorded_by_name?: string;
  notes?: string;
  is_auto_recorded?: boolean;
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
  const [temperatureData, setTemperatureData] = useState<TemperatureRecord[]>([]);
  const [comments, setComments] = useState('');
  const [hasAnomalies, setHasAnomalies] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<MonthlyStatus | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    yearMonth ? parseISO(`${yearMonth}-01`) : new Date()
  );
  const { toast } = useToast();
  const router = useRouter();

  // 初期データの読み込み
  useEffect(() => {
    if (!isAdmin) {
      // 管理者でない場合はリダイレクト
      router.push(backHref);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      
      try {
        // ユーザープロフィールの取得
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (profileData) {
          setUserProfile(profileData);
        }
        
        // 年月の文字列を取得
        const formattedYearMonth = format(selectedMonth, 'yyyy-MM');
        const monthStart = startOfMonth(selectedMonth);
        const monthEnd = endOfMonth(selectedMonth);
        
        console.log("月次データ取得期間:", {
          yearMonth: formattedYearMonth,
          start: format(monthStart, 'yyyy-MM-dd'),
          end: format(monthEnd, 'yyyy-MM-dd'),
          departmentId
        });
        
        // 指定された月の温度データを取得
        const { data: tempData, error: tempError } = await supabase
          .from('temperature_records')
          .select(`
            id,
            created_at,
            is_auto_recorded,
            temperature_record_details (
              id,
              temperature_item_id,
              value,
              data_source
            )
          `)
          .eq('department_id', departmentId)
          .eq('facility_id', facilityId)
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString())
          .order('created_at', { ascending: false });
          
        if (tempError) {
          console.error("温度データ取得エラー:", tempError);
          throw tempError;
        }
        
        // データを整形
        const formattedData = tempData?.map(record => {
          // 温度値を計算（複数ある場合は平均）
          const temperatures = record.temperature_record_details
            .filter(detail => detail.value !== null && typeof detail.value === 'number')
            .map(detail => detail.value);
          
          const avgTemperature = temperatures.length > 0
            ? temperatures.reduce((sum, val) => sum + val, 0) / temperatures.length
            : 0;
            
          return {
            id: record.id,
            created_at: record.created_at,
            temperature: parseFloat(avgTemperature.toFixed(1)),
            is_auto_recorded: record.is_auto_recorded
          };
        }) || [];
        
        console.log(`取得した温度データ: ${formattedData?.length}件`);
        setTemperatureData(formattedData);
        
        // 月次確認状況を取得
        console.log("月次確認状況の取得:", {
          facilityId,
          departmentId,
          yearMonth: formattedYearMonth
        });
        
        const { data: verificationData, error: verificationError } = await supabase
          .from('monthly_temperature_verifications')
          .select('*, verified_by_profile:profiles(fullname)')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .eq('year_month', formattedYearMonth)
          .single();
          
        if (verificationError) {
          if (verificationError.code !== 'PGRST116') { // PGRST116は「レコードなし」エラー
            console.error("確認状況取得エラー:", verificationError);
            throw verificationError;
          } else {
            console.log("確認レコードなし");
          }
        } else {
          console.log("確認レコード:", verificationData);
        }
        
        if (verificationData) {
          setVerificationStatus({
            yearMonth: formattedYearMonth,
            isVerified: true,
            verifiedAt: verificationData.verified_at,
            verifiedBy: verificationData.verified_by_profile?.fullname || '不明なユーザー',
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
          title: "エラー",
          description: "データの読み込み中にエラーが発生しました。",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [departmentId, facilityId, userId, selectedMonth, isAdmin, backHref, router, toast]);
  
  // 月次確認処理
  const handleVerifyMonth = async () => {
    if (!verificationStatus || saving) return;
    
    setSaving(true);
    
    try {
      const { yearMonth } = verificationStatus;
      
      console.log("月次確認処理開始:", {
        facilityId,
        departmentId,
        yearMonth,
        hasAnomalies,
        comments: comments ? "入力あり" : "なし"
      });
      
      // 既存レコードのチェック
      const { data: existingVerification, error: checkError } = await supabase
        .from('monthly_temperature_verifications')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('department_id', departmentId)
        .eq('year_month', yearMonth)
        .maybeSingle();
        
      if (checkError) {
        console.error("既存レコード確認エラー:", checkError);
        throw checkError;
      }
      
      console.log("既存の確認レコード:", existingVerification);
      
      if (existingVerification) {
        // 既存レコードの更新
        console.log(`レコードID ${existingVerification.id} を更新`);
        const { error: updateError } = await supabase
          .from('monthly_temperature_verifications')
          .update({
            comments: comments,
            has_anomalies: hasAnomalies,
            verified_at: new Date().toISOString(),
            verified_by: userId
          })
          .eq('id', existingVerification.id);
          
        if (updateError) {
          console.error("更新エラー:", updateError);
          throw updateError;
        }
      } else {
        // 新規レコードの作成
        console.log("新規レコード作成");
        const newRecord = {
          facility_id: facilityId,
          department_id: departmentId,
          year_month: yearMonth,
          comments: comments,
          has_anomalies: hasAnomalies,
          verified_at: new Date().toISOString(),
          verified_by: userId
        };
        
        console.log("挿入するデータ:", newRecord);
        
        const { data: insertData, error: insertError } = await supabase
          .from('monthly_temperature_verifications')
          .insert(newRecord)
          .select();
          
        if (insertError) {
          console.error("挿入エラー:", insertError);
          throw insertError;
        }
        
        console.log("挿入結果:", insertData);
      }
      
      // 状態を更新
      setVerificationStatus(prev => prev ? {
        ...prev,
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: userProfile?.fullname || '現在のユーザー',
        comments: comments,
        hasAnomalies: hasAnomalies
      } : null);
      
      toast({
        title: "確認完了",
        description: `${format(selectedMonth, 'yyyy年M月', { locale: ja })}の温度確認を記録しました。`,
      });
      
      // 温度管理ページに戻る（オプション）
      // router.push(backHref);
    } catch (error) {
      console.error('確認処理エラー:', error);
      toast({
        title: "エラー",
        description: "月次確認の処理中にエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // 前月に移動
  const handlePreviousMonth = () => {
    setSelectedMonth(prevMonth => subMonths(prevMonth, 1));
  };

  // 翌月に移動
  const handleNextMonth = () => {
    setSelectedMonth(prevMonth => addMonths(prevMonth, 1));
  };
  
  if (loading) {
    return (
      <>
        <AppHeader 
          title={`${departmentName} - 月次温度確認`} 
          showBackButton={true} 
        />
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500">データを読み込んでいます...</span>
        </div>
      </>
    );
  }
  
  if (!verificationStatus) {
    return (
      <>
        <AppHeader 
          title={`${departmentName} - 月次温度確認`} 
          showBackButton={true} 
        />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">データが見つかりません</h2>
          <p className="text-yellow-600">指定された月のデータが見つかりませんでした。別の月を選択してください。</p>
          <Button 
            className="mt-4" 
            onClick={() => router.push(backHref)}
          >
            温度管理ページに戻る
          </Button>
        </div>
      </>
    );
  }
  
  const formattedMonthText = format(selectedMonth, 'yyyy年M月', { locale: ja });
  
  return (
    <>
      <AppHeader 
        title={`${departmentName} - 月次温度確認`} 
        showBackButton={true} 
      />
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-gray-50 rounded-t-lg">
            <CardTitle className="text-2xl font-bold text-primary flex items-center justify-between">
              <span className="flex items-center">
                <Calendar className="h-6 w-6 mr-2 text-primary" />
                {formattedMonthText}の温度記録確認
              </span>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePreviousMonth}
                  disabled={loading}
                >
                  前月
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleNextMonth}
                  disabled={loading || new Date(selectedMonth) > new Date()}
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
                  {departmentName}の{formattedMonthText}の温度記録を確認してください。
                  問題がなければ「確認完了」ボタンをクリックしてください。
                </p>
              </div>
            )}
            
            {/* 温度データ表示セクション */}
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
                      {temperatureData.slice(0, 50).map((record) => (
                        <tr key={record.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDateForDisplay(record.created_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {record.temperature}℃
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {record.is_auto_recorded ? (
                              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">自動</span>
                            ) : (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">手動</span>
                            )}
                          </td>
                        </tr>
                      ))}
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
            
            {/* 確認フォーム */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="anomalies"
                  checked={hasAnomalies}
                  onCheckedChange={setHasAnomalies}
                  disabled={verificationStatus.isVerified}
                />
                <Label htmlFor="anomalies" className="text-gray-700">
                  異常（管理範囲外の温度の発生など）あり
                </Label>
              </div>
              
              <div>
                <Label htmlFor="comments" className="text-gray-700 mb-2 block">
                  コメント（問題点や対応など）
                </Label>
                <Textarea
                  id="comments"
                  placeholder="確認時のコメントを入力してください..."
                  className="w-full"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  disabled={verificationStatus.isVerified}
                />
              </div>
              
              <div className="pt-4 flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => router.push(backHref)}
                >
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
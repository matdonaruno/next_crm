'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { useSupabase } from '@/components/SupabaseProvider';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
// Link を削除 (Link from 'next/link';)
import { AppHeader } from '@/components/ui/app-header';
import { useRouter } from 'next/navigation';

interface WeeklyStatus {
  weekStartDate: string;
  weekEndDate: string;
  isVerified: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  comments: string | null;
  hasAnomalies: boolean;
}

interface WeeklyVerificationClientProps {
  departmentId: string;
  facilityId: string;
  departmentName: string;
  userId: string;
  weekStart?: string;
  weekEnd?: string;
  backHref?: string;
}

export function WeeklyVerificationClient({ 
  departmentId, 
  facilityId,
  departmentName, 
  userId,
  weekStart,
  weekEnd,
  backHref = '/temperature'
}: WeeklyVerificationClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [temperatureData, setTemperatureData] = useState<any[]>([]);
  const [comments, setComments] = useState('');
  const [hasAnomalies, setHasAnomalies] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<WeeklyStatus | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const supabase = useSupabase();
  const { user, profile } = useAuth();

  // 初期データの読み込み
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // AuthContextからプロフィールを使用（重複削除）
        console.log("ユーザープロフィール:", profile);
        
        // 週のデータが指定されていない場合は現在の週を使用
        const currentWeekStart = weekStart 
          ? parseISO(weekStart) 
          : startOfWeek(new Date(), { weekStartsOn: 1 });
        
        const currentWeekEnd = weekEnd
          ? parseISO(weekEnd)
          : endOfWeek(currentWeekStart, { weekStartsOn: 1 });
        
        const formattedWeekStart = format(currentWeekStart, 'yyyy-MM-dd');
        const formattedWeekEnd = format(currentWeekEnd, 'yyyy-MM-dd');
        
        console.log("週の期間:", {
          formattedWeekStart,
          formattedWeekEnd,
          facilityId,
          departmentId
        });
        
        // 指定された週の温度データを取得
        const { data: tempData, error: tempError } = await supabase
          .from('temperature_records')
          .select('*')
          .eq('department_id', departmentId)
          .gte('created_at', formattedWeekStart)
          .lte('created_at', formattedWeekEnd)
          .order('created_at', { ascending: true });
          
        if (tempError) {
          console.error("温度データ取得エラー:", tempError);
          throw tempError;
        }
        
        console.log(`取得した温度データ: ${tempData?.length}件`);
        setTemperatureData(tempData || []);
        
        // 週の確認状況を取得
        console.log("週次確認状況の取得:", {
          facilityId,
          departmentId,
          weekStartDate: formattedWeekStart
        });
        
        // データベーステーブル構造を確認
        console.log("テーブル構造確認");
        const { data: tableData, error: structError } = await supabase
          .from('weekly_temperature_verifications')
          .select('*')
          .limit(1);
          
        if (structError) {
          console.error("テーブル構造確認エラー:", structError);
        } else {
          console.log("weekly_temperature_verificationsの例:", tableData);
        }
        
        const { data: verificationData, error: verificationError } = await supabase
          .from('weekly_temperature_verifications')
          .select('*')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .eq('week_start_date', formattedWeekStart)
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
        
        // プロフィール情報を別途取得
        let verifierName = '不明なユーザー';
        if (verificationData && verificationData.verified_by) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('fullname')
            .eq('id', verificationData.verified_by)
            .single();
            
          if (!profileError && profileData) {
            verifierName = profileData.fullname;
          }
        }
        
        if (verificationData) {
          setVerificationStatus({
            weekStartDate: formattedWeekStart,
            weekEndDate: formattedWeekEnd,
            isVerified: true,
            verifiedAt: verificationData.verified_at,
            verifiedBy: verifierName,
            comments: verificationData.comments,
            hasAnomalies: verificationData.has_anomalies
          });
          
          setComments(verificationData.comments || '');
          setHasAnomalies(verificationData.has_anomalies || false);
        } else {
          setVerificationStatus({
            weekStartDate: formattedWeekStart,
            weekEndDate: formattedWeekEnd,
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
  }, [departmentId, facilityId, userId, weekStart, weekEnd, toast, supabase]); // supabase を依存配列に追加
  
  // 週の確認処理
  const handleVerifyWeek = async () => {
    if (!verificationStatus || saving) return;
    
    setSaving(true);
    
    try {
      const { weekStartDate } = verificationStatus;
      
      console.log("確認処理開始:", {
        facilityId,
        departmentId,
        weekStartDate,
        hasAnomalies,
        comments: comments ? "入力あり" : "なし"
      });
      
      // 既存レコードのチェック
      const { data: existingVerification, error: checkError } = await supabase
        .from('weekly_temperature_verifications')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('department_id', departmentId)
        .eq('week_start_date', weekStartDate)
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
          .from('weekly_temperature_verifications')
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
          week_start_date: weekStartDate,
          week_end_date: format(endOfWeek(parseISO(weekStartDate), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          comments: comments,
          has_anomalies: hasAnomalies,
          verified_at: new Date().toISOString(),
          verified_by: userId
        };
        
        console.log("挿入するデータ:", newRecord);
        
        const { data: insertData, error: insertError } = await supabase
          .from('weekly_temperature_verifications')
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
        description: `週次温度確認を記録しました。`,
      });
      
      // 温度管理ページに戻る
      router.push(backHref);
    } catch (error) {
      console.error('確認処理エラー:', error);
      toast({
        title: "エラー",
        description: "週次確認の処理中にエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return <LoadingSpinner message="データを読み込んでいます..." fullScreen />;
  }
  
  if (!verificationStatus) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h2 className="text-xl font-semibold text-yellow-700 mb-2">データが見つかりません</h2>
        <p className="text-yellow-600">指定された週のデータが見つかりませんでした。別の週を選択してください。</p>
        <Button 
          className="mt-4" 
          onClick={() => router.push(backHref)}
        >
          温度管理ページに戻る
        </Button>
      </div>
    );
  }
  
  const formattedStartDate = format(parseISO(verificationStatus.weekStartDate), 'yyyy年M月d日', { locale: ja });
  const formattedEndDate = format(parseISO(verificationStatus.weekEndDate), 'yyyy年M月d日', { locale: ja });
  
  return (
    <>
      <AppHeader 
        title={`${departmentName} - 週次温度確認`} 
        showBackButton={true} 
      />
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-gray-50 rounded-t-lg">
            <CardTitle className="text-2xl font-bold text-primary">
              {departmentName} - 週次温度確認
            </CardTitle>
            <p className="text-gray-600">
              確認期間: {formattedStartDate} 〜 {formattedEndDate}
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
                  確認日時: {format(parseISO(verificationStatus.verifiedAt!), 'yyyy/MM/dd HH:mm')}
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
                  {departmentName}の{formattedStartDate}〜{formattedEndDate}の温度記録を確認してください。
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">記録者</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">備考</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {temperatureData.map((record) => (
                        <tr key={record.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {format(new Date(record.created_at), 'yyyy/MM/dd HH:mm')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {record.temperature}°C
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {record.recorded_by_name || '不明'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {record.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  異常（管理範囲外の温度など）あり
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
                    onClick={handleVerifyWeek}
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
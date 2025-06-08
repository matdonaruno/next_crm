'use client';

import { useState, useEffect } from 'react';
import supabase from '@/lib/supabaseBrowser';
import { format, startOfWeek, endOfWeek, subWeeks, isSameWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { FileCheck, AlertCircle, ChevronRight, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Profile {
  id: string;
  fullname: string;
  facility_id: string;
}

interface VerificationStatusProps {
  facilityId: string;
  departmentId: string;
  departmentName: string;
}

export function VerificationStatus({ 
  facilityId, 
  departmentId, 
  departmentName 
}: VerificationStatusProps) {
  const [loading, setLoading] = useState(true);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();
  
  // 過去5週間のチェック状況を取得
  useEffect(() => {
    const fetchVerifications = async () => {
      if (!facilityId || !departmentId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // 今日の日付から1ヶ月前までの週をカバーするためのデータを生成
        const today = new Date();
        const fiveWeeksAgo = subWeeks(today, 5);
        const startDate = format(fiveWeeksAgo, 'yyyy-MM-dd');
        
        console.log('Fetching weekly verifications:', {
          facilityId,
          departmentId,
          startDate
        });
        
        // weekly_temperature_verificationsテーブルの存在確認
        const { data: tableInfo, error: tableError } = await supabase
          .from('weekly_temperature_verifications')
          .select('*')
          .limit(1);
          
        if (tableError) {
          console.error('テーブル確認エラー:', tableError);
          throw new Error(`テーブルアクセスエラー: ${tableError.message}`);
        }
        
        console.log('テーブル確認結果:', tableInfo ? '存在します' : '空または存在しません');
        
        // 週次確認データの取得
        const { data, error } = await supabase
          .from('weekly_temperature_verifications')
          .select('id, week_start_date, verified_by, verified_at, comments, has_anomalies')
          .eq('facility_id', facilityId)
          .eq('department_id', departmentId)
          .gte('week_start_date', startDate)
          .order('week_start_date', { ascending: false });
          
        if (error) {
          console.error('Supabase query error:', error);
          throw new Error(`${error.message} (${error.code})`);
        }
        
        console.log('Fetched verification data:', data);
        
        // 過去5週間のデータを準備
        const last5Weeks = [];
        for (let i = 0; i < 5; i++) {
          const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          
          // 該当する週のデータを探す
          const weekData = data?.find(v => {
            const vStart = new Date(v.week_start_date);
            return isSameWeek(vStart, weekStart, { weekStartsOn: 1 });
          });
          
          last5Weeks.push({
            weekStart,
            weekEnd,
            verification: weekData || null,
            current: i === 0
          });
        }
        
        setVerifications(last5Weeks);
        
        // ユーザープロファイル情報の取得
        if (data && data.length > 0) {
          const userIds = [...new Set(data.map(v => v.verified_by))];
          
          for (const userId of userIds) {
            if (!userId) continue;
            
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('id, fullname')
              .eq('id', userId)
              .single();
              
            if (profileError) {
              console.warn(`プロフィール取得エラー (${userId}):`, profileError);
              continue;
            }
              
            if (profileData) {
              setUserProfiles(prev => ({
                ...prev,
                [userId]: profileData
              }));
            }
          }
        }
      } catch (err: any) {
        console.error('確認データ取得エラー:', err);
        setError(err?.message || '週次確認データの取得に失敗しました');
        
        // 空の配列（デフォルト）
        const today = new Date();
        const defaultWeeks = [];
        for (let i = 0; i < 5; i++) {
          const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          
          defaultWeeks.push({
            weekStart,
            weekEnd,
            verification: null,
            current: i === 0
          });
        }
        
        setVerifications(defaultWeeks);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVerifications();
  }, [facilityId, departmentId]);
  
  const navigateToVerification = (weekStart: Date, weekEnd: Date) => {
    router.push(
      `/temperature/weekly-verification?` +
      `department=${encodeURIComponent(departmentName ?? '')}&` +
      `departmentId=${departmentId ?? ''}&` +
      `facilityId=${facilityId ?? ''}&` +
      `weekStart=${format(weekStart, 'yyyy-MM-dd')}&` +
      `weekEnd=${format(weekEnd, 'yyyy-MM-dd')}`
    );
  };
  
  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="h-10 w-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-2 text-sm text-pink-700">確認状況を読み込み中...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-yellow-800 font-medium flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 text-yellow-500" />
          データ取得エラー
        </h3>
        <p className="mt-2 text-sm text-yellow-700">{error}</p>
        <Button 
          variant="outline" 
          size="sm"
          className="mt-3"
          onClick={() => window.location.reload()}
        >
          再読み込み
        </Button>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div 
        className="flex justify-between items-center mb-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-semibold flex items-center">
          <FileCheck className="h-5 w-5 mr-2 text-blue-500" />
          温度管理週次確認の状況
        </h3>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigateToVerification(verifications[0].weekStart, verifications[0].weekEnd);
            }}
          >
            今週の確認を実施
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="space-y-3">
          {verifications.map((week, index) => {
            const hasVerification = !!week.verification;
            const hasAnomaly = hasVerification && week.verification.has_anomalies;
            
            return (
              <div 
                key={index} 
                className={`
                  flex justify-between items-center p-3 rounded-lg border
                  ${week.current ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}
                  ${hasAnomaly ? 'bg-yellow-50 border-yellow-200' : ''}
                  hover:bg-gray-50 cursor-pointer
                `}
                onClick={() => navigateToVerification(week.weekStart, week.weekEnd)}
              >
                <div>
                  <p className="font-medium">
                    {format(week.weekStart, 'yyyy年MM月dd日', { locale: ja })} ~ 
                    {format(week.weekEnd, 'MM月dd日', { locale: ja })}
                    {week.current && (
                      <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        今週
                      </span>
                    )}
                  </p>
                  
                  {hasVerification ? (
                    <p className="text-sm text-gray-600">
                      {format(new Date(week.verification.verified_at), 'yyyy/MM/dd HH:mm')}に
                      {userProfiles[week.verification.verified_by]?.fullname || '不明'}
                      さんが確認済み
                      {hasAnomaly && (
                        <span className="ml-2 text-yellow-600">
                          <AlertCircle className="h-3 w-3 inline-block mr-1" />
                          異常あり
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      <Clock className="h-3 w-3 inline-block mr-1" />
                      未確認
                    </p>
                  )}
                </div>
                
                <div>
                  {hasVerification ? (
                    <div className="flex items-center text-green-600">
                      <CheckCircle className="h-5 w-5 mr-1" />
                      <span className="text-sm font-medium">確認済</span>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost">
                      確認する
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 
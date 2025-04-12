'use client';

import { useState } from 'react';
import { format, addDays, isEqual, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { Equipment, PrecisionManagementRecordWithDetails } from '@/types/precision-management';

// Props型定義
interface WeeklyRecordsSummaryProps {
  departmentId: string;
  equipments: Equipment[];
  records: PrecisionManagementRecordWithDetails[];
  startDate: Date;
  endDate: Date;
}

interface DayStatus {
  date: string;
  dateDisplay: string;
  recordCount: number;
  isComplete: boolean;
  hasError: boolean;
  hasShiftTrend: boolean;
}

export function WeeklyRecordsSummary({ 
  departmentId, 
  equipments, 
  records, 
  startDate, 
  endDate
}: WeeklyRecordsSummaryProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [managerApproved, setManagerApproved] = useState(false);
  const [supervisorApproved, setSupervisorApproved] = useState(false);

  // 日付の配列を作成（月曜日から日曜日）
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  // 1日あたりの必要な記録数を計算（実装例：機器数と同じ数の記録が必要）
  const requiredRecordsPerDay = equipments.length;
  
  // 日付ごとの記録状況を確認
  const getDayStatus = (date: Date): DayStatus => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayRecords = records.filter(r => 
      r.implementation_date === dateStr && 
      r.department_id === departmentId
    );
    
    return {
      date: dateStr,
      dateDisplay: format(date, 'MM/dd (EE)', { locale: ja }),
      recordCount: dayRecords.length,
      isComplete: dayRecords.length >= requiredRecordsPerDay,
      hasError: dayRecords.some(r => r.error_count > 0),
      hasShiftTrend: dayRecords.some(r => r.shift_trend),
    };
  };

  // 各日の状況
  const daysStatus = weekDays.map(getDayStatus);

  // 全ての必要な記録が入力されているか確認
  const isWeekComplete = daysStatus.every(day => day.isComplete);

  // 承認処理
  const handleApprove = async (role: 'manager' | 'supervisor') => {
    setIsApproving(true);
    
    try {
      // 通常はここでAPIを呼び出して承認を保存する
      // この例ではフロントエンドの状態のみを変更
      if (role === 'manager') {
        setManagerApproved(true);
        toast({
          title: '管理者承認完了',
          description: '週間記録が管理者により承認されました',
        });
      } else {
        setSupervisorApproved(true);
        toast({
          title: '承認者承認完了',
          description: '週間記録が承認者により承認されました',
        });
      }
    } catch (error) {
      console.error('承認処理エラー:', error);
      toast({
        title: 'エラーが発生しました',
        description: '承認処理中にエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 週間サマリーカード */}
      <Card>
        <CardHeader>
          <CardTitle>週間記録状況</CardTitle>
          <CardDescription>
            期間: {format(startDate, 'yyyy年MM月dd日')} 〜 {format(endDate, 'yyyy年MM月dd日')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>記録数</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>エラー</TableHead>
                <TableHead>シフト/トレンド</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daysStatus.map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{day.dateDisplay}</TableCell>
                  <TableCell>{day.recordCount} / {requiredRecordsPerDay}</TableCell>
                  <TableCell>
                    {day.isComplete ? (
                      <span className="text-green-600 font-medium">完了</span>
                    ) : (
                      <span className="text-red-600 font-medium">未完了</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {day.hasError ? (
                      <span className="text-red-600 font-medium">あり</span>
                    ) : (
                      <span className="text-green-600 font-medium">なし</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {day.hasShiftTrend ? (
                      <span className="text-amber-600 font-medium">あり</span>
                    ) : (
                      <span className="text-green-600 font-medium">なし</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 記録詳細リスト */}
      <Card>
        <CardHeader>
          <CardTitle>記録詳細</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日付</TableHead>
                <TableHead>機器</TableHead>
                <TableHead>実施者</TableHead>
                <TableHead>タイミング</TableHead>
                <TableHead>実施件数</TableHead>
                <TableHead>エラー件数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length > 0 ? (
                records.map((record) => (
                  <TableRow key={record.record_id}>
                    <TableCell>{record.implementation_date}</TableCell>
                    <TableCell>{record.equipment_name}</TableCell>
                    <TableCell>{record.implementer}</TableCell>
                    <TableCell>{record.timing_name}</TableCell>
                    <TableCell>{record.implementation_count}</TableCell>
                    <TableCell className={record.error_count > 0 ? 'text-red-600 font-medium' : ''}>
                      {record.error_count}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    記録がありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* 承認セクション */}
      <Card>
        <CardHeader>
          <CardTitle>週間承認</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Checkbox 
                id="manager-approval" 
                checked={managerApproved}
                disabled={!isWeekComplete || isApproving}
                onCheckedChange={() => handleApprove('manager')}
              />
              <label htmlFor="manager-approval">
                管理者承認
              </label>
            </div>
            
            <div className="flex items-center gap-4">
              <Checkbox 
                id="supervisor-approval" 
                checked={supervisorApproved}
                disabled={!managerApproved || !isWeekComplete || isApproving}
                onCheckedChange={() => handleApprove('supervisor')}
              />
              <label htmlFor="supervisor-approval">
                承認者承認
              </label>
            </div>
            
            {!isWeekComplete && (
              <p className="text-red-600 text-sm">
                全ての日の記録が完了していないため承認できません
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 
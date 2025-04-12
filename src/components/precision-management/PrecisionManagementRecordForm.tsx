'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isToday, parseISO } from 'date-fns';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from '@/components/ui/use-toast';
import { Equipment, ImplementationTiming } from '@/types/precision-management';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2, CheckCircle2, Save, PcCase, Clock, Search, Plus, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { post } from '@/utils/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import React from 'react';

// 履歴エントリの型定義
interface HistoryEntry {
  timestamp: string;
  timing_name: string;
  implementation_count: number;
  error_count: number;
  shift_trend: boolean;
  remarks: string | null;
  implementation_time: string;
}

// フォーム型定義
interface RecordInput {
  timing_id: number | null;
  implementation_count: number;
  error_count: number;
  shift_trend: boolean;
  remarks: string;
  implementation_time: string;
}

interface RecordCard {
  equipment: Equipment;
  data: RecordInput;
  history: HistoryEntry[];
}

// Props型定義
interface PrecisionManagementRecordFormProps {
  departmentId: string;
  equipments: Equipment[];
  timings: ImplementationTiming[];
  onRecordAdded: () => void;
}

export function PrecisionManagementRecordForm({ 
  departmentId, 
  equipments = [], 
  timings = [],
  onRecordAdded 
}: PrecisionManagementRecordFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
  const [equipmentArray, setEquipmentArray] = useState<Equipment[]>([]);
  const [timingArray, setTimingArray] = useState<ImplementationTiming[]>([]);
  const [recordCards, setRecordCards] = useState<RecordCard[]>([]);
  const [submittedCards, setSubmittedCards] = useState<Map<string, number>>(new Map());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const router = useRouter();
  
  // 検索機能のための状態
  const [searchQuery, setSearchQuery] = useState("");
  
  // 認証と認可の確認
  const { user, profile, loading, isAuthenticated, authCheck } = useRequireAuth();

  // 履歴の表示/非表示を切り替える
  const toggleHistory = (equipmentId: string) => {
    setExpandedHistory(prev => {
      const newSet = new Set(prev);
      if (newSet.has(equipmentId)) {
        newSet.delete(equipmentId);
      } else {
        newSet.add(equipmentId);
      }
      return newSet;
    });
  };

  // 日付が変わったかチェックし、変わっていたら履歴をリセット
  useEffect(() => {
    const checkDate = () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const lastDateStr = localStorage.getItem('lastRecordDate');
      
      if (lastDateStr && lastDateStr !== todayStr) {
        // 日付が変わった場合、履歴をリセット
        setRecordCards(prev => 
          prev.map(card => ({
            ...card,
            history: []
          }))
        );
        setSubmittedCards(new Map());
        console.log('日付が変わったため、履歴をリセットしました');
      }
      
      // 今日の日付を保存
      localStorage.setItem('lastRecordDate', todayStr);
    };
    
    checkDate();
    
    // タブがアクティブになった時に再チェック
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkDate();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // equipmentsとtimingsが配列であることを確認
  useEffect(() => {
    // 機器データの確認
    if (Array.isArray(equipments)) {
      setEquipmentArray(equipments);
    } else {
      console.error('機器データが配列ではありません:', equipments);
      setEquipmentArray([]);
      toast({
        title: '警告',
        description: '機器データの読み込みに問題があります。管理者に連絡してください。',
        variant: 'destructive',
      });
    }

    // 実施タイミングデータの確認
    if (Array.isArray(timings)) {
      setTimingArray(timings);
    } else {
      console.error('実施タイミングデータが配列ではありません:', timings);
      setTimingArray([]);
    }

    // 時間を15分単位に丸める関数
    const roundTimeToNearest15Minutes = (time: Date): string => {
      const hours = time.getHours();
      const minutes = Math.round(time.getMinutes() / 15) * 15;
      
      // 分が60になった場合は時間を1つ進める
      const adjustedHours = minutes === 60 ? hours + 1 : hours;
      const adjustedMinutes = minutes === 60 ? 0 : minutes;
      
      return `${String(adjustedHours).padStart(2, '0')}:${String(adjustedMinutes).padStart(2, '0')}`;
    };

    // 機器のカードデータを初期化（タイミングは選択式にするため個別には作成しない）
    if (equipments.length > 0) {
      const cards: RecordCard[] = equipments.map(equipment => ({
        equipment,
        data: {
          timing_id: null,
          implementation_count: 1,
          error_count: 0,
          shift_trend: false,
          remarks: '',
          implementation_time: roundTimeToNearest15Minutes(new Date())
        },
        history: []
      }));
      setRecordCards(cards);
    }
  }, [equipments, timings]);

  // 入力値の更新ハンドラ
  const handleInputChange = (equipmentId: number, field: keyof RecordInput, value: any) => {
    setRecordCards(prev => 
      prev.map(card => {
        if (card.equipment.pm_equipment_id === equipmentId) {
          return {
            ...card,
            data: {
              ...card.data,
              [field]: value
            }
          };
        }
        return card;
      })
    );
  };

  // タイミングが「その他」かどうかを判定する関数
  const isOtherTiming = (timingId: number | null): boolean => {
    if (!timingId) return false;
    const timing = timingArray.find(t => t.timing_id === timingId);
    return timing?.timing_name.includes('その他') || false;
  };

  // 記録を登録する関数
  const submitRecord = async (card: RecordCard) => {
    if (!isAuthenticated) {
      toast({
        title: '認証エラー',
        description: 'ログインが必要です',
        variant: 'destructive',
      });
      router.push('/login');
      return;
    }

    // タイミングが選択されていない場合はエラー
    if (card.data.timing_id === null) {
      toast({
        title: '入力エラー',
        description: '実施タイミングを選択してください',
        variant: 'destructive',
      });
      return;
    }

    // 「その他」タイミングで時間が入力されていない場合はエラー
    if (isOtherTiming(card.data.timing_id) && (!card.data.implementation_time || card.data.implementation_time === '')) {
      toast({
        title: '入力エラー',
        description: '「その他」タイミングの場合は実施時間を入力してください',
        variant: 'destructive',
      });
      return;
    }

    // 実施者名が空の場合はプロファイル名を使用
    const implementer = profile?.fullname || user?.email || '';

    if (!implementer) {
      toast({
        title: '入力エラー',
        description: '実施者名を入力してください',
        variant: 'destructive',
      });
      return;
    }

    const cardId = `${card.equipment.pm_equipment_id}`;
    setIsSubmitting(true);
    setSubmittingCardId(cardId);

    const selectedTiming = timingArray.find(t => t.timing_id === card.data.timing_id);
    
    const recordData = {
      department_id: departmentId,
      pm_equipment_id: card.equipment.pm_equipment_id,
      implementation_date: format(new Date(), 'yyyy-MM-dd'),
      implementation_time: card.data.implementation_time || '00:00',
      implementer: implementer,
      timing_id: card.data.timing_id,
      implementation_count: card.data.implementation_count,
      error_count: card.data.error_count,
      shift_trend: card.data.shift_trend,
      remarks: card.data.remarks || null,
    };

    // 送信する前に時間部分を確認
    console.log('送信する日付:', recordData.implementation_date);
    console.log('送信する時間:', recordData.implementation_time);

    try {
      // 共通API関数を使用して記録を追加
      await post('/api/precision-management', recordData);
      
      // 成功メッセージ
      toast({
        title: '記録を登録しました',
        description: `${card.equipment.equipment_name}の${selectedTiming?.timing_name || ''}の記録が保存されました`,
      });
      
      // 履歴に追加
      const newHistoryEntry: HistoryEntry = {
        timestamp: new Date().toISOString(),
        timing_name: selectedTiming?.timing_name || '不明なタイミング',
        implementation_count: card.data.implementation_count,
        error_count: card.data.error_count,
        shift_trend: card.data.shift_trend,
        remarks: card.data.remarks || null,
        implementation_time: card.data.implementation_time
      };
      
      setRecordCards(prev => 
        prev.map(c => {
          if (c.equipment.pm_equipment_id === card.equipment.pm_equipment_id) {
            return {
              ...c,
              history: [newHistoryEntry, ...c.history]
            };
          }
          return c;
        })
      );
      
      // 登録済みカードを記録
      setSubmittedCards(prev => {
        const newMap = new Map(prev);
        const currentCount = newMap.get(cardId) || 0;
        newMap.set(cardId, currentCount + 1);
        return newMap;
      });
      
      // 履歴パネルを自動的に表示
      setExpandedHistory(prev => {
        const newSet = new Set(prev);
        newSet.add(cardId);
        return newSet;
      });
      
      // 登録後はタイミングをリセットするが、他の値は保持
      handleInputChange(card.equipment.pm_equipment_id, 'timing_id', null);
      
      onRecordAdded();
    } catch (error) {
      console.error('記録登録エラー:', error);
      toast({
        title: 'エラーが発生しました',
        description: error instanceof Error ? error.message : '記録の登録に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setSubmittingCardId(null);
    }
  };

  // 検索フィルター
  const filteredRecordCards = recordCards.filter(card => 
    card.equipment.equipment_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 認証チェック中または認証エラーの場合
  if (loading || authCheck === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">認証情報を確認中...</p>
      </div>
    );
  }

  // 認証エラーの場合
  if (!isAuthenticated || authCheck === 'failed') {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>認証エラー</AlertTitle>
        <AlertDescription>ログインが必要です。ログインページにリダイレクトします。</AlertDescription>
      </Alert>
    );
  }

  // 機器データがない場合の表示
  if (equipmentArray.length === 0) {
    return (
      <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md">
        <h3 className="text-lg font-semibold text-yellow-800 mb-2">機器データが見つかりません</h3>
        <p className="text-sm text-yellow-700 mb-4">この部署に登録された精度管理機器がありません。まずは機器を登録してください。</p>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          size="sm"
        >
          再読み込み
        </Button>
      </div>
    );
  }

  // 日時フォーマット用関数
  const formatDateTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'HH:mm');
    } catch (e) {
      return '不明な時刻';
    }
  };

  return (
    <div className="space-y-6">
      {/* 検索と追加機能のヘッダー */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 bg-background p-4 rounded-lg border">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="機器名で検索..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center text-sm text-muted-foreground">
          <span>登録済み記録: {Array.from(submittedCards.values()).reduce((sum, count) => sum + count, 0)}件</span>
        </div>
      </div>
      
      {/* テーブルビュー */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-60">機器名</TableHead>
              <TableHead className="w-56">タイミング</TableHead>
              <TableHead className="w-28 text-center">実施時間</TableHead>
              <TableHead className="w-16 text-center">サンプル数</TableHead>
              <TableHead className="w-16 text-center">エラー</TableHead>
              <TableHead className="w-28 text-center">シフト/トレンド</TableHead>
              <TableHead className="w-36">備考</TableHead>
              <TableHead className="w-24 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecordCards.map((card) => {
              const cardId = `${card.equipment.pm_equipment_id}`;
              const submittedCount = submittedCards.get(cardId) || 0;
              const hasSubmitted = submittedCount > 0;
              const isCardSubmitting = isSubmitting && submittingCardId === cardId;
              const isHistoryExpanded = expandedHistory.has(cardId);
              
              return (
                <React.Fragment key={cardId}>
                  <TableRow className={hasSubmitted ? "bg-green-50" : ""}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <PcCase className="h-4 w-4 text-primary mr-2" />
                        <span>{card.equipment.equipment_name}</span>
                      </div>
                      {hasSubmitted && (
                        <div className="flex items-center justify-between text-green-600 text-xs mt-1">
                          <div className="flex items-center">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            <span>本日{submittedCount}件の記録済</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleHistory(cardId)}
                          >
                            {isHistoryExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={card.data.timing_id?.toString() || ""}
                        onValueChange={(value) => handleInputChange(card.equipment.pm_equipment_id, 'timing_id', parseInt(value))}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="タイミングを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {timingArray.map((timing) => (
                            <SelectItem
                              key={timing.timing_id}
                              value={timing.timing_id.toString()}
                              className="text-sm"
                            >
                              {timing.timing_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="time"
                        value={card.data.implementation_time}
                        onChange={(e) => handleInputChange(card.equipment.pm_equipment_id, 'implementation_time', e.target.value)}
                        className={`h-9 text-sm w-24 mx-auto text-center ${isOtherTiming(card.data.timing_id) ? 'border-2 border-primary bg-primary/5' : ''}`}
                        step="900"
                      />
                      {isOtherTiming(card.data.timing_id) && (
                        <p className="text-xs text-primary mt-1">※時間必須</p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="1"
                        value={card.data.implementation_count}
                        onChange={(e) => handleInputChange(card.equipment.pm_equipment_id, 'implementation_count', parseInt(e.target.value) || 0)}
                        className="h-9 text-sm w-16 mx-auto text-center"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min="0"
                        value={card.data.error_count}
                        onChange={(e) => handleInputChange(card.equipment.pm_equipment_id, 'error_count', parseInt(e.target.value) || 0)}
                        className="h-9 text-sm w-16 mx-auto text-center"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          id={`${cardId}-shift`}
                          checked={card.data.shift_trend}
                          onCheckedChange={(checked) => handleInputChange(card.equipment.pm_equipment_id, 'shift_trend', checked === true)}
                        />
                        <label
                          htmlFor={`${cardId}-shift`}
                          className="text-xs font-medium leading-none cursor-pointer ml-2"
                        >
                          あり
                        </label>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Textarea
                        value={card.data.remarks}
                        onChange={(e) => handleInputChange(card.equipment.pm_equipment_id, 'remarks', e.target.value)}
                        className="h-9 min-h-0 resize-none text-sm"
                        placeholder="メモを入力"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        onClick={() => submitRecord(card)}
                        disabled={isSubmitting || card.data.timing_id === null}
                        size="sm"
                        variant="secondary"
                        className="h-8 w-full text-xs"
                      >
                        {isCardSubmitting ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            登録中
                          </>
                        ) : (
                          <>
                            <Save className="mr-1 h-3 w-3" />
                            登録
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  {/* 履歴表示パネル */}
                  {hasSubmitted && isHistoryExpanded && card.history.length > 0 && (
                    <TableRow key={`${cardId}-history`} className="bg-gray-50">
                      <TableCell colSpan={7} className="p-0">
                        <div className="p-3 text-sm">
                          <h4 className="font-medium text-xs mb-2 text-gray-700">本日の入力履歴</h4>
                          <div className="space-y-2">
                            {card.history.map((entry, index) => (
                              <div key={`${cardId}-history-${index}`} className="border-l-2 border-primary pl-3 py-1">
                                <div className="flex items-center text-xs text-gray-600 mb-1">
                                  <Clock className="h-3 w-3 mr-1" />
                                  <span>{formatDateTime(entry.timestamp)}</span>
                                  <span className="mx-2">|</span>
                                  <span className="font-medium">{entry.timing_name}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                                  <span>時間: {entry.implementation_time}</span>
                                  <span>サンプル数: {entry.implementation_count}</span>
                                  <span>エラー: {entry.error_count}</span>
                                  <span>シフト/トレンド: {entry.shift_trend ? 'あり' : 'なし'}</span>
                                  {entry.remarks && <span>備考: {entry.remarks}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* カレンダー用のスタイルのメモ */}
      {/* 
        カレンダーコンポーネントのスタイル変更のサンプル:
        
        .calendar-day-with-data {
          position: relative;
        }
        .calendar-day-with-data::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #8b5cf6;
        }
        .calendar-day-selected.calendar-day-with-data {
          background-color: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
          font-weight: bold;
        }
      */}
    </div>
  );
} 
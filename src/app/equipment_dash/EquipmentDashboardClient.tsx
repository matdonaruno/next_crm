'use client';

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  AlertTriangle,
  Calendar,
  Clock,
  Settings,
  Wrench,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  RefreshCw,
  FileText,
  List,
  Grid,
  TableIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { setSessionCheckEnabled } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/ui/app-header";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, eachDayOfInterval, startOfMonth, endOfMonth, differenceInDays, subMonths, addMonths, getYear, getMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import holidays from '@holiday-jp/holiday_jp';

// 機器タイプ
interface Equipment {
  id: string;
  name: string;
  description: string | null;
  facility_id: string;
  department_id: string;
  created_at: string;
  updated_at: string;
  department_name?: string; // Join時に使用
  checkItems?: EquipmentCheckItem[];
  pendingChecks?: number; // 未実施の点検数
}

// 点検項目
interface EquipmentCheckItem {
  id: string;
  equipment_id: string;
  name: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
  created_at: string;
  updated_at: string;
  lastCheckDate?: string | null; // 最終点検日
  lastCheckResult?: boolean | null; // 最終点検結果
  isOverdue?: boolean; // 点検期限超過フラグ
}

// 点検記録
interface MaintenanceRecord {
  id: string;
  check_item_id: string;
  equipment_id: string;
  performed_by: string;
  performed_at: string;
  result: boolean;
  comment: string | null;
  created_at: string;
  performer_name?: string; // Join時に使用
  check_item_name?: string; // Join時に使用
  equipment_name?: string; // Join時に使用
}

// モーダルで扱うデータの型
interface ModalCheckItemData extends EquipmentCheckItem {
  submitResult: boolean; // true: 正常, false: 異常
  submitComment: string | null;
}

// 日付フォーマット関数
const formatDateTime = (timestamp: string | null) => {
  if (!timestamp) return "未実施";
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// 点検頻度を日本語に変換
const frequencyToJapanese = (frequency: string) => {
  switch (frequency) {
    case 'daily': return '毎日';
    case 'weekly': return '毎週';
    case 'monthly': return '毎月';
    case 'as_needed': return '必要時';
    default: return frequency;
  }
};

// 点検期限超過のチェック
const isCheckOverdue = (lastCheckDate: string | null, frequency: string): boolean => {
  if (!lastCheckDate) return true; // 未実施の場合は超過扱い
  
  const now = new Date();
  const lastCheck = new Date(lastCheckDate);
  const timeDiff = now.getTime() - lastCheck.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
  
  switch (frequency) {
    case 'daily': 
      return daysDiff > 1;
    case 'weekly': 
      return daysDiff > 7;
    case 'monthly': 
      return daysDiff > 30;
    case 'as_needed':
      return false; // 必要時は期限なし
    default:
      return false;
  }
};

// ★ テーブル表示用データの型
interface TableCellData {
  result: boolean | null; // true: 正常, false: 異常, null: 未実施
  recordId?: string; // 対応する点検記録ID (オプション)
}
interface TableRowData {
  type: 'equipment' | 'frequency' | 'item';
  id: string; // equipmentId または itemId
  equipmentName?: string;
  itemName?: string;
  frequency?: string;
  cells: Record<string, TableCellData>; // key: 'YYYY-MM-DD'
}

// ★ 表示モードの型
type ViewMode = 'equipment' | 'frequency' | 'table'; // ★ viewModeの型定義を先に

// 日本の祝日判定関数
const isJapaneseHoliday = (date: Date): boolean => {
  return holidays.isHoliday(date);
};

// 祝日の名前を取得する関数
const getHolidayName = (date: Date): string | null => {
  const holiday = holidays.between(date, date)[0];
  return holiday ? holiday.name : null;
};

export default function EquipmentDashboardClient() {
  const { profile, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  
  // 状態管理
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [expandedEquipment, setExpandedEquipment] = useState<Record<string, boolean>>({});
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId || "all");
  
  // 通知関連の状態
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'warning',
      message: '3件の機器点検が期限切れです',
      timestamp: new Date(),
    },
    {
      id: 2,
      type: 'info',
      message: '新しい点検ガイドラインが公開されました',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1日前
    }
  ]);
  
  // クライアントサイドのみで動作する状態
  const [isClient, setIsClient] = useState(false);
  
  // クライアントサイドでのみ実行される処理
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // 日付を固定フォーマットで表示する関数（hydration errorを避けるため）
  const formatNotificationDate = (date: Date) => {
    if (!isClient) {
      // サーバーサイドでは空文字を返す
      return '';
    }
    // クライアントサイドでのみ日付をフォーマット
    return format(date, 'yyyy/MM/dd HH:mm', { locale: ja });
  };
  
  // フィルターと検索
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  
  // データ読み込み中
  useEffect(() => {
    // コンポーネントのマウント時にセッション確認を無効化
    setSessionCheckEnabled(false);
    console.log("EquipmentDashboard: セッション確認を無効化しました");

    // visibility変更を監視し、Supabaseの自動更新を防ぐ
    const handleVisibilityChange = () => {
      // visibilitychangeイベントを処理するが、不要なリロードを抑制
      console.log("EquipmentDashboard: visibilitychangeイベント検出しましたが、リロードはスキップします");
    };

    // visibilitychangeイベントリスナーを追加
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // クリーンアップ時（コンポーネントのアンマウント時）にセッション確認を再度有効化
    return () => {
      setSessionCheckEnabled(true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      console.log("EquipmentDashboard: セッション確認を再有効化しました");
    };
  }, []);
  
  // 機器データをフェッチするための状態
  const [dataFetchTrigger, setDataFetchTrigger] = useState(0);
  
  // データの手動リロード関数
  const handleManualRefresh = useCallback(() => {
    setDataFetchTrigger(prev => prev + 1);
  }, []);
  
  // 初期データ取得
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      
      setIsLoading(true);
      try {
        // ユーザープロファイル取得
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(`
            id, 
            fullname, 
            facility_id,
            facilities(id, name)
          `)
          .eq('id', user.id)
          .single();
        
        if (profileError) throw profileError;
        
        if (profileData) {
          setCurrentUserName(profileData.fullname || '');
          setFacilityId(profileData.facility_id || '');
          const facilityInfo = profileData.facilities;
          if (facilityInfo && typeof facilityInfo === 'object' && 'name' in facilityInfo && typeof facilityInfo.name === 'string') {
             setFacilityName(facilityInfo.name || '');
          } else {
             setFacilityName(''); // 空文字列をセット
             console.warn('[DEBUG] Facility info is not in the expected format or name is not a string:', facilityInfo);
          }
          
          // 部署一覧取得
          if (profileData.facility_id) {
            const { data: deptData, error: deptError } = await supabase
              .from('departments')
              .select('id, name')
              .eq('facility_id', profileData.facility_id)
              .order('name');
              
            if (!deptError && deptData) {
              setDepartments(deptData);
            }
          }
        }
        
        // 選択した部署IDが指定されていない場合はURLのパラメータを使用
        if (departmentId && !selectedDepartmentId) {
          setSelectedDepartmentId(departmentId);
        }
        
      } catch (error) {
        console.error('初期データ取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchInitialData();
  }, [user, departmentId, selectedDepartmentId]);
  
  // 機器一覧と点検記録の取得
  useEffect(() => {
    const fetchEquipmentAndRecords = async () => {
      if (!facilityId) return;
      
      setIsLoading(true);
      try {
        // 機器一覧取得
        let query = supabase
          .from('equipment')
          .select(`
            *,
            departments(name)
          `)
          .eq('facility_id', facilityId);
        
        // 部署フィルター
        if (selectedDepartmentId && selectedDepartmentId !== 'all') {
          query = query.eq('department_id', selectedDepartmentId);
        }
        
        const { data: equipmentData, error: equipmentError } = await query.order('name');
        
        if (equipmentError) throw equipmentError;
        
        // 機器データを整形
        const formattedEquipment: Equipment[] = equipmentData ? equipmentData.map(item => ({
          ...item,
          department_name: item.departments?.name || '',
          checkItems: [],
          pendingChecks: 0
        })) : [];
        
        // 点検項目を取得
        const equipmentIds = formattedEquipment.map(e => e.id);
        if (equipmentIds.length > 0) {
          const { data: checkItemsData, error: checkItemsError } = await supabase
            .from('equipment_check_items')
            .select('*')
            .in('equipment_id', equipmentIds)
            .order('name');
            
          if (checkItemsError) {
            console.error('[DEBUG] Check items fetch error:', checkItemsError);
            throw checkItemsError;
          }

          const { data: recordsData, error: recordsError } = await supabase
            .from('equipment_maintenance_records')
            .select(`
              *,
              profiles(fullname)
            `)
            .in('equipment_id', equipmentIds)
            .order('performed_at', { ascending: false });
            
          if (recordsError) {
             console.error('[DEBUG] Maintenance records fetch error:', recordsError);
             throw recordsError;
          }
          
          // 点検記録一覧用のデータを設定
          const formattedRecords: MaintenanceRecord[] = recordsData ? recordsData.map(record => ({
            ...record,
            performer_name: record.profiles?.fullname || '',
          })) : [];
          
          setMaintenanceRecords(formattedRecords);
          
          // 点検項目に最終点検日を追加
          const checkItemsWithLastCheck = checkItemsData ? checkItemsData.map(item => {
            const lastRecord = formattedRecords.find(r => r.check_item_id === item.id);
            return {
              ...item,
              lastCheckDate: lastRecord?.performed_at || null,
              lastCheckResult: lastRecord ? lastRecord.result : null,
              isOverdue: isCheckOverdue(lastRecord?.performed_at || null, item.frequency)
            };
          }) : [];
          
          // 各機器に点検項目を関連付け
          formattedEquipment.forEach(equipment => {
            const items = checkItemsWithLastCheck.filter(item => item.equipment_id === equipment.id);
            equipment.checkItems = items;
            equipment.pendingChecks = items.filter(item => item.isOverdue).length;
          });
        }
        
        setEquipmentList(formattedEquipment);
      } catch (error) {
        console.error('機器データ取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // 初回ロード時またはトリガーが変更されたときのみデータを取得
    fetchEquipmentAndRecords();
    
    // facilityIdとselectedDepartmentIdが変わった時、または明示的なトリガー時のみ
  }, [facilityId, selectedDepartmentId, dataFetchTrigger]);
  
  // 検索とフィルター適用済みの機器リスト
  const filteredEquipment = useMemo(() => {
    return equipmentList.filter(equipment => {
      // 検索クエリに一致するか確認
      const matchesSearch = searchQuery === '' || 
        equipment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (equipment.description && equipment.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        equipment.department_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        equipment.checkItems?.some(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // 期限切れ点検のみ表示するか確認
      const matchesOverdue = !showOverdueOnly || equipment.pendingChecks! > 0;
      
      return matchesSearch && matchesOverdue;
    });
  }, [equipmentList, searchQuery, showOverdueOnly]);
  
  // 検索とフィルター適用済みの点検記録
  const filteredRecords = useMemo(() => {
    return maintenanceRecords.filter(record => {
      const matchesSearch = searchQuery === '' || 
        record.equipment_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        record.check_item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.performer_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    }).sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
  }, [maintenanceRecords, searchQuery]);
  
  // ★ すべて展開/閉じるハンドラ
  const toggleAllEquipment = () => {
    const newState = !isAllExpanded;
    setIsAllExpanded(newState);
    // 更新後の状態を計算するロジックを明確にする
    const updatedExpandedState: Record<string, boolean> = {};
    // equipmentListから現在のキーを取得して状態を設定
    equipmentList.forEach(eq => {
      updatedExpandedState[eq.id] = newState;
    });
    setExpandedEquipment(updatedExpandedState);
  };
  
  // 実際の展開状態を確認する関数を追加
  const checkActualExpandedState = useCallback(() => {
    // 機器が1つも無い場合は何もしない
    if (equipmentList.length === 0) return;
    
    // 展開されている機器の数をカウント
    const expandedCount = Object.values(expandedEquipment).filter(Boolean).length;
    
    // すべての機器が展開されているかどうかを確認
    const allExpanded = expandedCount === equipmentList.length;
    
    // 実際の状態と保持している状態が異なる場合は更新
    if (allExpanded !== isAllExpanded) {
      setIsAllExpanded(allExpanded);
    }
  }, [equipmentList, expandedEquipment, isAllExpanded]);

  // 展開状態が変わったときに実際の状態をチェック
  useEffect(() => {
    checkActualExpandedState();
  }, [expandedEquipment, checkActualExpandedState]);
  
  // 機器の展開/折りたたみを切り替え
  const toggleEquipment = (equipmentId: string) => {
    setExpandedEquipment(prev => {
      const newState = {
      ...prev,
      [equipmentId]: !prev[equipmentId]
      };
      
      return newState;
    });
  };
  
  // 点検実施処理
  const handleCheckItem = async (equipment: Equipment, checkItem: EquipmentCheckItem) => {
    if (!user) return;
    
    try {
      // 点検記録を追加
      const { data, error } = await supabase
        .from('equipment_maintenance_records')
        .insert([
          {
            check_item_id: checkItem.id,
            equipment_id: equipment.id,
            performed_by: user.id,
            performed_at: new Date().toISOString(),
            result: true,
            comment: null
          }
        ])
        .select();
        
      if (error) throw error;
      
      // 画面を更新
      window.location.reload();
    } catch (error) {
      console.error('点検記録登録エラー:', error);
      alert('点検記録の登録に失敗しました');
    }
  };
  
  // 部署変更ハンドラ
  const handleDepartmentChange = (value: string) => {
    setSelectedDepartmentId(value);
  };

  // 日付範囲関連の状態
  // 最初は現在月を選択
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [tableDateRange, setTableDateRange] = useState<{ start: Date; end: Date }>(() => {
    const today = new Date();
    const start = startOfMonth(today);
    const end = endOfMonth(today);
    return { start, end };
  });

  // 年月の選択肢を生成 (今月から3年前まで)
  const monthOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // 過去3年分の月を選択肢として生成
    for (let year = currentYear; year >= currentYear - 3; year--) {
      const endMonth = year === currentYear ? currentMonth : 11;
      const startMonth = 0; // 1月
      
      for (let month = endMonth; month >= startMonth; month--) {
        options.push({
          value: `${year}-${month}`,
          label: `${year}年${month + 1}月`,
          date: new Date(year, month, 1)
        });
      }
    }
    
    return options;
  }, []);

  // 選択された月が変更されたときに日付範囲を更新する
  useEffect(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    console.log('日付範囲を更新:', format(start, 'yyyy/MM/dd'), '~', format(end, 'yyyy/MM/dd'));
    setTableDateRange({ start, end });
  }, [selectedMonth]);

  // 月選択ハンドラ
  const handleMonthChange = (yearMonthValue: string) => {
    console.log('選択された年月:', yearMonthValue);
    
    try {
      // 値の解析
      const [year, month] = yearMonthValue.split('-').map(Number);
      
      // 値のバリデーション
      if (isNaN(year) || isNaN(month) || year < 1900 || year > 2100 || month < 0 || month > 11) {
        console.error('不正な年月の値:', yearMonthValue);
        return;
      }
      
      console.log(`${year}年${month + 1}月に変更します`);
      const newDate = new Date(year, month, 1);
      setSelectedMonth(newDate);
    } catch (error) {
      console.error('年月の解析エラー:', error);
    }
  };

  const [selectedCheckItemIds, setSelectedCheckItemIds] = useState<Set<string>>(new Set());
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
  const [isSubmittingAllDepartment, setIsSubmittingAllDepartment] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalCheckItemData[]>([]);
  const [submittingFromModal, setSubmittingFromModal] = useState(false);

  // チェックボックス変更ハンドラ
  const handleCheckboxChange = (itemId: string, checked: boolean): void => {
    setSelectedCheckItemIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  // すべて選択/解除ハンドラ
  const handleSelectAllChecks = (equipmentId: string, select: boolean) => {
    const equipment = equipmentList.find(eq => eq.id === equipmentId);
    if (!equipment || !equipment.checkItems) return;

    setSelectedCheckItemIds(prev => {
      const newSet = new Set(prev);
      equipment.checkItems?.forEach(item => {
        if (select) {
          newSet.add(item.id);
        } else {
          newSet.delete(item.id);
        }
      });
      return newSet;
    });
  };

  // ★ 部署内の全項目を選択/解除するハンドラ
  const handleSelectAllDepartmentChecks = (select: boolean) => {
    if (!filteredEquipment) return;
    
    setSelectedCheckItemIds(prev => {
      const newSet = new Set(prev);
      filteredEquipment.forEach(equipment => {
        equipment.checkItems?.forEach(item => {
          if (select) {
            newSet.add(item.id);
      } else {
            newSet.delete(item.id);
          }
        });
      });
      return newSet;
    });
  };

  // ★ 点検項目を頻度でグループ化するヘルパー
  const groupCheckItemsByFrequency = (items: EquipmentCheckItem[] | undefined): Record<string, EquipmentCheckItem[]> => {
    if (!items) return {};
    const grouped: Record<string, EquipmentCheckItem[]> = {
      daily: [], weekly: [], monthly: [], as_needed: []
    };
    items.forEach(item => {
      // frequency の型を厳密にチェック
      const freqKey = item.frequency as keyof typeof grouped;
      if (grouped[freqKey]) {
        grouped[freqKey].push(item);
      } else {
        console.warn("Unknown frequency:", item.frequency);
      }
    });
    // 項目がない頻度は削除
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });
    return grouped;
  };

  // ★ モーダル内で結果やコメントが変更されたときのハンドラ
  const handleModalDataChange = (itemId: string, field: 'submitResult' | 'submitComment', value: boolean | string | null) => {
    setModalData(prev => prev.map(item => {
      if (item.id === itemId) {
        const newResult = field === 'submitResult' ? (value as boolean) : item.submitResult;
        const newComment = field === 'submitComment' ? (value as string | null) : item.submitComment;
        return {
          ...item,
          [field]: value,
          submitComment: newResult === true ? null : newComment
        };
      }
      return item;
    }));
  };

  // ★ モーダルからの一括登録実行ハンドラ
  const handleSubmitFromModal = async () => {
    if (!user) return;
    if (modalData.length === 0) return;

    setSubmittingFromModal(true);
    try {
      const recordsToInsert = modalData.map(item => ({
        check_item_id: item.id,
        equipment_id: item.equipment_id,
        performed_by: user.id,
        performed_at: new Date().toISOString(),
        result: item.submitResult,
        comment: item.submitResult ? null : item.submitComment
      }));

      const { data: insertedRecords, error } = await supabase
        .from('equipment_maintenance_records')
        .insert(recordsToInsert)
        .select();

      if (error) throw error;

      // --- UI状態の更新 --- 
      const nowStr = new Date().toISOString();
      const updatedItemIds = modalData.map(item => item.id);

      setEquipmentList(prevList => prevList.map(eq => {
        const itemsToUpdate = eq.checkItems?.filter(item => updatedItemIds.includes(item.id)) ?? [];
        if (itemsToUpdate.length === 0) return eq;

        const updatedCheckItems = eq.checkItems?.map(item => {
          const updatedInfo = modalData.find(m => m.id === item.id);
          if (updatedInfo) {
            return {
              ...item,
              lastCheckDate: nowStr,
              lastCheckResult: updatedInfo.submitResult,
              isOverdue: false
            };
          }
          return item;
        });

        return {
          ...eq,
          checkItems: updatedCheckItems,
          pendingChecks: updatedCheckItems?.filter(item => item.isOverdue).length ?? 0
        };
      }));

      // 新しいレコードを履歴に追加
      if (insertedRecords) {
        const formattedNewRecords = insertedRecords.map(rec => {
          const equipment = equipmentList.find(e => e.id === rec.equipment_id);
          const checkItem = equipment?.checkItems?.find(i => i.id === rec.check_item_id);
          return {
             ...rec,
             performer_name: currentUserName,
             check_item_name: checkItem?.name,
             equipment_name: equipment?.name
          };
        });
        setMaintenanceRecords(prev => [...formattedNewRecords, ...prev]);
      }

      // 選択をクリア & モーダルを閉じる
      setSelectedCheckItemIds(prev => {
         const newSet = new Set(prev);
         updatedItemIds.forEach(id => newSet.delete(id));
         return newSet;
      });
      setIsSubmitModalOpen(false);
      setModalData([]);

      alert(`${modalData.length}項目の点検を記録しました。`);

    } catch (error: any) {
      console.error('モーダルからの点検記録エラー:', error);
      alert(`点検記録の登録に失敗しました: ${error.message}`);
    } finally {
      setSubmittingFromModal(false);
    }
  };

  // 頻度別表示の展開状態を管理
  const [expandedFrequencies, setExpandedFrequencies] = useState<Record<string, boolean>>({
    daily: true,
    weekly: true,
    monthly: true,
    as_needed: true
  });
  
  // 頻度別表示ですべての頻度が展開されているかどうか
  const [isAllFrequenciesExpanded, setIsAllFrequenciesExpanded] = useState(true);
  
  // 頻度の展開/収縮を切り替える
  const toggleFrequency = (frequency: string) => {
    setExpandedFrequencies(prev => {
      const newState = {
        ...prev,
        [frequency]: !prev[frequency]
      };
      
      // すべて展開されているかチェック
      const allExpanded = Object.values(newState).every(Boolean);
      setIsAllFrequenciesExpanded(allExpanded);
      
      return newState;
    });
  };
  
  // すべての頻度の展開/収縮を切り替える
  const toggleAllFrequencies = () => {
    const newState = !isAllFrequenciesExpanded;
    setIsAllFrequenciesExpanded(newState);
    
    const updatedFrequencies: Record<string, boolean> = {};
    Object.keys(expandedFrequencies).forEach(freq => {
      updatedFrequencies[freq] = newState;
    });
    
    setExpandedFrequencies(updatedFrequencies);
  };

  // === 頻度別表示モード ===
  const renderFrequencyContent = () => {
    if (viewMode !== 'frequency') {
      return null;
    }

    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (filteredEquipment.length === 0) {
      return (
        <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
          <p className="text-muted-foreground mb-4">検索条件に一致する機器がありません</p>
          <Button variant="outline" onClick={() => { setSearchQuery(''); setShowOverdueOnly(false); }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            検索条件をリセット
          </Button>
        </div>
      );
    }
    
    // 頻度別に項目をグループ化
    const frequencyGroups: Record<string, {
      items: Array<{equipment: Equipment, checkItem: EquipmentCheckItem}>,
      overdueCount: number
    }> = {
      daily: { items: [], overdueCount: 0 },
      weekly: { items: [], overdueCount: 0 },
      monthly: { items: [], overdueCount: 0 },
      as_needed: { items: [], overdueCount: 0 }
    };

    // 機器の点検項目を頻度別にグループ化
    filteredEquipment.forEach(equipment => {
      equipment.checkItems?.forEach(item => {
        if (frequencyGroups[item.frequency]) {
          frequencyGroups[item.frequency].items.push({
            equipment,
            checkItem: item
          });
          if (item.isOverdue) {
            frequencyGroups[item.frequency].overdueCount++;
          }
        }
      });
    });

    // 頻度ごとの表示名とアイコン
    const frequencyInfo = {
      daily: { 
        name: '毎日', 
        icon: <Clock className="h-5 w-5 text-blue-500" />,
        description: '毎日実施が必要な点検項目です。',
        color: 'border-blue-200 bg-blue-50'
      },
      weekly: { 
        name: '毎週', 
        icon: <Calendar className="h-5 w-5 text-green-500" />,
        description: '週に一度実施が必要な点検項目です。',
        color: 'border-green-200 bg-green-50'
      },
      monthly: { 
        name: '毎月', 
        icon: <FileText className="h-5 w-5 text-purple-500" />,
        description: '月に一度実施が必要な点検項目です。',
        color: 'border-purple-200 bg-purple-50'
      },
      as_needed: { 
        name: '必要時', 
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        description: '必要に応じて実施する点検項目です。',
        color: 'border-amber-200 bg-amber-50'
      }
    };
    
    // 項目がある頻度の数をカウント
    const frequencyCount = Object.entries(frequencyGroups).filter(([_, group]) => group.items.length > 0).length;

    return (
      <div className="space-y-6">
        {/* すべての頻度を展開/収縮するボタン */}
        {frequencyCount > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllFrequencies}
              className="text-xs"
            >
              {isAllFrequenciesExpanded ? 'すべて閉じる' : 'すべて展開する'}
            </Button>
          </div>
        )}
        
        {Object.entries(frequencyGroups).map(([frequency, group]) => {
          // 項目がない頻度は表示しない
          if (group.items.length === 0) return null;
          
          const info = frequencyInfo[frequency as keyof typeof frequencyInfo];
          const isExpanded = expandedFrequencies[frequency];
          
          // 機器ごとに項目をグループ化
          const equipmentItems: Record<string, {
            equipment: Equipment,
            items: EquipmentCheckItem[]
          }> = {};
          
          group.items.forEach(({equipment, checkItem}) => {
            if (!equipmentItems[equipment.id]) {
              equipmentItems[equipment.id] = {
                equipment,
                items: []
              };
            }
            equipmentItems[equipment.id].items.push(checkItem);
          });
          
          return (
            <Card key={`frequency-${frequency}`} className={`overflow-hidden border-l-4 ${info.color}`}>
              <CardHeader 
                className="bg-white p-4 cursor-pointer flex flex-row items-center"
                onClick={() => toggleFrequency(frequency)}
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    {info.icon}
                    <CardTitle className="text-lg font-semibold">{info.name}点検</CardTitle>
                    <Badge variant="outline" className={info.color}>
                      {group.items.length}項目
                    </Badge>
                    {group.overdueCount > 0 && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        期限切れ: {group.overdueCount}項目
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFrequency(frequency);
                  }}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="p-4 bg-white">
                  {/* 頻度内の全選択/解除ボタン */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // この頻度の全項目を選択
                          setSelectedCheckItemIds(prev => {
                            const newSet = new Set(prev);
                            group.items.forEach(({checkItem}) => {
                              newSet.add(checkItem.id);
                            });
                            return newSet;
                          });
                        }}
                      >
                        すべて選択
                      </Button>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // この頻度の全項目を解除
                          setSelectedCheckItemIds(prev => {
                            const newSet = new Set(prev);
                            group.items.forEach(({checkItem}) => {
                              newSet.delete(checkItem.id);
                            });
                            return newSet;
                          });
                        }}
                      >
                        すべて解除
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => {
                        // この頻度の選択項目を一括点検
                        const selectedItemsInFrequency = Array.from(selectedCheckItemIds).filter(id => 
                          group.items.some(item => item.checkItem.id === id)
                        );
                        if (selectedItemsInFrequency.length > 0) {
                          handleOpenSubmitModal(null, selectedItemsInFrequency);
                        } else {
                          alert('点検する項目を選択してください。');
                        }
                      }}
                      disabled={isLoadingSubmit || !Array.from(selectedCheckItemIds).some(id => 
                        group.items.some(item => item.checkItem.id === id)
                      )}
                      className="bg-primary hover:bg-primary/90 text-white"
                      size="sm"
                    >
                      {`選択した${info.name}点検 (${Array.from(selectedCheckItemIds).filter(id => 
                        group.items.some(item => item.checkItem.id === id)
                      ).length}項目) を実施`}
                    </Button>
                  </div>
                  
                  {/* 機器ごとの項目表示 */}
                  <div className="space-y-4">
                    {Object.values(equipmentItems).map(({equipment, items}) => (
                      <div key={`${frequency}-${equipment.id}`} className="border rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-primary" />
                            <h3 className="font-medium">{equipment.name}</h3>
                            <span className="text-xs text-muted-foreground">{equipment.department_name}</span>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button 
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                // この機器のこの頻度の項目をすべて選択
                                setSelectedCheckItemIds(prev => {
                                  const newSet = new Set(prev);
                                  items.forEach(item => {
                                    newSet.add(item.id);
                                  });
                                  return newSet;
                                });
                              }}
                            >
                              選択
                            </Button>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                // この機器のこの頻度の項目をすべて解除
                                setSelectedCheckItemIds(prev => {
                                  const newSet = new Set(prev);
                                  items.forEach(item => {
                                    newSet.delete(item.id);
                                  });
                                  return newSet;
                                });
                              }}
                            >
                              解除
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mt-2">
                          {items.map(item => (
                            <div 
                              key={item.id} 
                              className={`p-2 rounded-md flex justify-between items-center ${
                                item.isOverdue ? 'bg-amber-50 border border-amber-200' : 'bg-white border'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <Checkbox 
                                  id={`freq-check-${item.id}`}
                                  checked={selectedCheckItemIds.has(item.id)}
                                  onCheckedChange={(checkedState) => {
                                    if (typeof checkedState === 'boolean') {
                                      handleCheckboxChange(item.id, checkedState);
                                    }
                                  }}
                                  aria-label={`Select ${item.name}`}
                                />
                                <Label htmlFor={`freq-check-${item.id}`} className="flex-grow cursor-pointer">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{item.name}</span>
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                                    <span className="flex items-center">
                                      <Calendar className="h-3.5 w-3.5 mr-1" />
                                      最終点検: {formatDateTime(item.lastCheckDate ?? null)}
                                    </span>
                                    {item.lastCheckResult !== null && (
                                      <span className="flex items-center">
                                        <span className={`mr-1 flex items-center justify-center w-4 h-4 rounded-full ${item.lastCheckResult ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {item.lastCheckResult ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                        </span>
                                        結果: {item.lastCheckResult ? '正常' : '異常'}
                                      </span>
                                    )}
                                  </div>
                                </Label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  // === テーブル表示モード ===
  const renderTableContent = () => {
    // 表示モードがテーブルでない場合は何も表示しない
    if (viewMode !== 'table') {
      return null;
    }

    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (tableData.rows.length === 0) {
      return (
        <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
          <p className="text-muted-foreground">表示対象期間に点検記録のある機器または該当期間の記録がありません。</p>
          
          {/* 日付範囲変更UI */}
          <div className="mt-4 flex justify-center">
            <div className="flex items-center gap-4 mt-2">
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('前月ボタンクリック (空データ)');
                  const prevMonth = subMonths(selectedMonth, 1);
                  setSelectedMonth(prevMonth);
                }}
                className="text-xs px-3 py-2 h-9 min-w-[60px]"
              >
                前月
              </Button>
              
              <div className="relative z-10">
                <Select 
                  defaultValue={`${getYear(selectedMonth)}-${getMonth(selectedMonth)}`}
                  value={`${getYear(selectedMonth)}-${getMonth(selectedMonth)}`}
                  onValueChange={(value) => {
                    console.log('セレクト変更 (空データ):', value);
                    const [year, month] = value.split('-').map(Number);
                    if (!isNaN(year) && !isNaN(month)) {
                      setSelectedMonth(new Date(year, month, 1));
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue>{format(selectedMonth, 'yyyy年M月')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {monthOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('次月ボタンクリック (空データ)');
                  const now = new Date();
                  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
                  
                  if (selectedMonth.getTime() >= currentMonthDate.getTime()) {
                    return;
                  }
                  
                  const nextMonth = addMonths(selectedMonth, 1);
                  setSelectedMonth(nextMonth);
                }}
                disabled={selectedMonth.getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()}
                className="text-xs px-3 py-2 h-9 min-w-[60px]"
              >
                次月
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div className="mb-4 md:mb-0 mr-4">
              <CardTitle>点検記録テーブル</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                期間: {format(tableDateRange.start, 'yyyy/MM/dd')} ~ {format(tableDateRange.end, 'yyyy/MM/dd')}
              </p>
            </div>

            {/* 月選択用のボタンとセレクター */}
            <div className="flex items-center gap-4 mt-2 md:mt-0">
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('前月ボタンクリック');
                  const prevMonth = subMonths(selectedMonth, 1);
                  console.log('変更前:', format(selectedMonth, 'yyyy/MM'), '変更後:', format(prevMonth, 'yyyy/MM'));
                  setSelectedMonth(prevMonth);
                }}
                className="text-xs px-3 py-2 h-9 min-w-[60px]"
              >
                前月
              </Button>
              
              <div className="relative z-10">
                <Select 
                  defaultValue={`${getYear(selectedMonth)}-${getMonth(selectedMonth)}`}
                  value={`${getYear(selectedMonth)}-${getMonth(selectedMonth)}`}
                  onValueChange={(value) => {
                    console.log('セレクト変更:', value);
                    // 値の解析
                    const [year, month] = value.split('-').map(Number);
                    if (!isNaN(year) && !isNaN(month)) {
                      console.log(`${year}年${month + 1}月に変更します`);
                      setSelectedMonth(new Date(year, month, 1));
                    }
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue>{format(selectedMonth, 'yyyy年M月')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {monthOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={() => {
                  console.log('次月ボタンクリック');
                  const now = new Date();
                  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
                  
                  // 現在の月より先には進めない
                  if (selectedMonth.getTime() >= currentMonthDate.getTime()) {
                    console.log('次月は選択できません（現在月以降）');
                    return;
                  }
                  
                  const nextMonth = addMonths(selectedMonth, 1);
                  console.log('変更前:', format(selectedMonth, 'yyyy/MM'), '変更後:', format(nextMonth, 'yyyy/MM'));
                  setSelectedMonth(nextMonth);
                }}
                disabled={selectedMonth.getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()}
                className="text-xs px-3 py-2 h-9 min-w-[60px]"
              >
                次月
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-full divide-y divide-gray-200 border-collapse border border-gray-300">
            <TableHeader className="bg-gray-50 sticky top-0 z-10"> 
              <TableRow>
                <TableHead className="sticky left-0 bg-gray-50 z-20 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 border border-gray-300 w-60 min-w-[240px]"> 
                  機器 / 点検項目
                </TableHead>
                {tableData.dates.map(dateStr => {
                  const dateObj = new Date(dateStr + 'T00:00:00');
                  const dayOfWeek = format(dateObj, 'E', { locale: ja });
                  const isSaturday = dayOfWeek === '土';
                  const isSunday = dayOfWeek === '日';
                  const isHoliday = isJapaneseHoliday(dateObj);
                  const holidayName = getHolidayName(dateObj);
                  
                  // 背景色の決定: 祝日 > 日曜日 > 土曜日 の優先順位
                  const bgColorClass = isHoliday ? 'bg-pink-50' : isSunday ? 'bg-red-50' : isSaturday ? 'bg-blue-50' : '';
                  const textColorClass = isHoliday ? 'text-pink-600' : isSunday ? 'text-red-600' : isSaturday ? 'text-blue-600' : 'text-gray-400';
                  
                  return (
                    <TableHead
                      key={dateStr}
                      className={`px-2 py-2 text-center text-sm font-semibold text-gray-900 border border-gray-300 ${bgColorClass} w-12`}
                    >
                      <div>{format(dateObj, 'd')}</div>
                      <div className={`text-xs ${textColorClass}`}>{dayOfWeek}</div>
                      {holidayName && (
                        <div className="text-xs text-pink-600 truncate max-w-[48px]" title={holidayName}>
                          {holidayName}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-200 bg-white">
              {tableData.rows.map(row => renderTableRow(row, tableData.dates))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  // ★ テーブル行レンダリング関数
  const renderTableRow = (row: TableRowData, dates: string[]): React.ReactNode => {
    if (row.type === 'equipment') {
      return (
        <TableRow key={row.id} className="bg-gray-100 font-semibold">
          <TableCell className="sticky left-0 bg-gray-100 z-10 px-3 py-2 text-sm text-gray-900 border border-gray-300 font-semibold whitespace-nowrap"> 
            {row.equipmentName}
          </TableCell>
          <TableCell colSpan={dates.length} className="px-3 py-2 border border-gray-300"></TableCell>
        </TableRow>
      );
    } else if (row.type === 'frequency') {
      return (
        <TableRow key={row.id} className="bg-gray-50">
          <TableCell className="sticky left-0 bg-gray-50 z-10 pl-6 pr-3 py-1 text-sm text-gray-700 border border-gray-300 whitespace-nowrap"> 
            {row.frequency}
          </TableCell>
          <TableCell colSpan={dates.length} className="px-3 py-1 border border-gray-300"></TableCell>
        </TableRow>
      );
    } else { // type === 'item'
      return (
        <TableRow key={row.id}>
          <TableCell className="sticky left-0 bg-white z-10 pl-9 pr-3 py-2 text-sm text-gray-700 border border-gray-300 whitespace-nowrap"> 
            {row.itemName}
          </TableCell>
          {dates.map(dateStr => {
            const cellData = row.cells[dateStr];
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = format(dateObj, 'E', { locale: ja });
            const isSaturday = dayOfWeek === '土';
            const isSunday = dayOfWeek === '日';
            const isHoliday = isJapaneseHoliday(dateObj);
            
            // 背景色の決定
            const bgColorClass = isHoliday ? 'bg-pink-50' : isSunday ? 'bg-red-50' : isSaturday ? 'bg-blue-50' : '';
            
            return (
              <TableCell 
                key={`${row.id}-${dateStr}`} 
                className={`px-2 py-2 text-center border border-gray-300 ${bgColorClass}`}
              >
                {cellData.result === true ? (
                  <Check className="h-4 w-4 text-green-500 inline-block" />
                ) : cellData.result === false ? (
                  <X className="h-4 w-4 text-red-500 inline-block" />
                ) : (
                  <span className="text-gray-300 text-sm">-</span>
                )}
              </TableCell>
            );
          })}
        </TableRow>
      );
    }
  };

  // ★ テーブル表示用のデータを生成するuseMemo
  const tableData = useMemo(() => {
    // viewModeをチェックしない。表示モードの切り替えでデータが変わるわけではない
    if (!filteredEquipment || maintenanceRecords.length === 0) {
      return { dates: [], rows: [] };
    }

    // 1. 表示する日付の配列を生成 (YYYY-MM-DD)
    const dates = eachDayOfInterval({ start: tableDateRange.start, end: tableDateRange.end })
                   .map(d => format(d, 'yyyy-MM-dd'));

    // 2. 点検記録を日付と項目IDで検索しやすいようにマップ化
    const recordsMap = new Map<string, TableCellData>(); // key: 'YYYY-MM-DD_checkItemId'
    maintenanceRecords.forEach(record => {
      try {
        const recordDateStr = format(new Date(record.performed_at), 'yyyy-MM-dd');
        if (dates.includes(recordDateStr)) { // 日付範囲内の記録のみ対象
            const key = `${recordDateStr}_${record.check_item_id}`;
            // 同じ日に複数記録がある場合、最新を優先 (既に降順でソートされている想定)
            if (!recordsMap.has(key)) {
              recordsMap.set(key, { result: record.result, recordId: record.id });
            }
        }
      } catch (e) {
        console.error("Error processing record date:", record.performed_at, e);
      }
    });

    // 3. テーブルの行データを生成
    const rows: TableRowData[] = [];
    filteredEquipment.forEach(equipment => {
      // 機器行
      rows.push({
        type: 'equipment',
        id: equipment.id,
        equipmentName: equipment.name,
        cells: {}, // 機器行のセルは空
      });

      // ★ groupCheckItemsByFrequency を参照できるようにする
      const groupedItems = groupCheckItemsByFrequency(equipment.checkItems);

      // ★ entries と items に型注針を追加
      Object.entries(groupedItems).forEach(([freq, items]: [string, EquipmentCheckItem[]]) => {
        if (items.length > 0) {
          // 頻度行 (オプション)
          rows.push({
             type: 'frequency',
             id: `${equipment.id}-${freq}`,
             frequency: frequencyToJapanese(freq),
             cells: {},
          });

          // ★ item に型注針を追加
          items.forEach((item: EquipmentCheckItem) => {
            // 点検項目行
            const cells: Record<string, TableCellData> = {};
            dates.forEach(dateStr => {
              const key = `${dateStr}_${item.id}`;
              cells[dateStr] = recordsMap.get(key) || { result: null }; // 記録がなければnull
            });

            rows.push({
              type: 'item',
              id: item.id,
              equipmentName: equipment.name, // どの機器の項目かわかるように追加
              itemName: item.name,
              cells: cells,
            });
          });
        }
      });
    });

    return { dates, rows };
  // viewModeを依存配列から削除。フィルタリングされた機器データ、メンテナンス記録、日付範囲が変わったときだけ再計算
  }, [filteredEquipment, maintenanceRecords, tableDateRange]);

  // モーダルを開く処理を拡張（特定のアイテムのみを対象に）
  const handleOpenSubmitModal = (equipmentId: string | null = null, specificItemIds: string[] | null = null) => {
    let itemsToProcess: string[] = [];
    
    if (specificItemIds) {
      // 特定のアイテムIDが指定された場合はそれらを使用
      itemsToProcess = specificItemIds;
      } else {
      // 従来のロジック：チェックボックスで選択されたアイテムから抽出
      itemsToProcess = Array.from(selectedCheckItemIds).filter(itemId => {
        if (equipmentId) {
          const equipment = equipmentList.find(eq => eq.id === equipmentId);
          return equipment?.checkItems?.some(item => item.id === itemId);
        } else {
          return filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === itemId));
        }
      });
    }
    
    if (itemsToProcess.length === 0) {
      alert('点検する項目を選択してください。');
      return;
    }
    
    // モーダルに渡すデータを準備
    const dataForModal: ModalCheckItemData[] = [];
    itemsToProcess.forEach(itemId => {
      // 全機器の中から該当する点検項目を探す
      let foundItem: EquipmentCheckItem | undefined;
      let parentEquipment: Equipment | undefined;
      
      for (const equipment of equipmentList) {
        const checkItem = equipment.checkItems?.find(item => item.id === itemId);
        if (checkItem) {
          foundItem = checkItem;
          parentEquipment = equipment;
          break;
        }
      }
      
      if (foundItem && parentEquipment) {
        dataForModal.push({
          ...foundItem,
          submitResult: true,
          submitComment: null
        });
      }
    });
    
    if (dataForModal.length === 0) {
      alert('選択された項目の詳細を取得できませんでした。');
      return;
    }
    
    // 項目名でソート (任意)
    dataForModal.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    
    setModalData(dataForModal);
    setIsSubmitModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <AppHeader 
        title="Equipment Manager" 
        showBackButton={true}
        icon={<Wrench className="h-6 w-6 text-emerald-500" />}
      />

      <div className="container py-6 max-w-7xl mx-auto px-4">
        {/* 通知エリア */}
        {notifications.length > 0 && (
          <div className="w-full mb-6">
            <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-md">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2 text-left">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                通知 ({notifications.length}件)
              </h3>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc pl-5 text-left">
                  {notifications.map((notification) => (
                    <li key={`notification-${notification.id}`} className="text-sm text-yellow-700 mb-1">
                      {notification.message}
                      {isClient && (
                      <span className="text-xs text-muted-foreground ml-2">
                          {formatNotificationDate(notification.timestamp)}
                      </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {/* ユーザー情報表示 */}
        <div className="w-full mb-4">
          <div className="text-right">
            {facilityName && (
              <p className="text-sm text-gray-600">
                施設「{facilityName}」
              </p>
            )}
            {currentUserName && (
              <p className="text-sm text-gray-600">
                {currentUserName}さんがログインしています
              </p>
            )}
          </div>
        </div>

        {/* ヘッダー部分 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Equipment Dashboard</h1>
            <p className="text-muted-foreground">
              {selectedDepartmentId === 'all' 
                ? '全部署' 
                : departments.find(d => d.id === selectedDepartmentId)?.name || departmentName}
              の機器管理・点検記録
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            {/* 手動更新ボタンを追加 */}
            <Button 
              variant="outline"
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="mr-2"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              データ更新
            </Button>
            <Button 
              onClick={() => router.push(`/equipment_dash/new?department=${encodeURIComponent(departmentName)}&departmentId=${encodeURIComponent(selectedDepartmentId !== 'all' ? selectedDepartmentId : departmentId)}`)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              新規機器登録
            </Button>
          </div>
        </div>
        
        {/* ★ 表示モード切替タブ (これがメインのタブになる) */}
        <Tabs defaultValue="table" className="mb-6" value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="table" className="text-base py-3">
              <TableIcon className="mr-2 h-4 w-4" />
              テーブル表示
            </TabsTrigger>
            <TabsTrigger value="equipment" className="text-base py-3">
              <List className="mr-2 h-4 w-4" />
              機器別表示
            </TabsTrigger>
            <TabsTrigger value="frequency" className="text-base py-3">
              <Grid className="mr-2 h-4 w-4" />
              頻度別表示
            </TabsTrigger>
          </TabsList>
          
          {/* === テーブル表示モード === */}
          <TabsContent value="table" className="mt-4">
            {renderTableContent()}
          </TabsContent>

          {/* === 機器別表示モード === */}
          <TabsContent value="equipment" className="mt-4">
            {/* ★★★ 部署全体操作ボタンと展開ボタンをこのタブ内に移動 ★★★ */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-2">
                {/* 部署の全選択/解除ボタン */} 
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectAllDepartmentChecks(true)}
                  disabled={isLoading || isSubmittingAllDepartment}
                >
                  部署の全項目を選択
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectAllDepartmentChecks(false)}
                  disabled={isLoading || isSubmittingAllDepartment}
                >
                  部署の全選択を解除
                </Button>
                {/* すべて展開/閉じるボタン */} 
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleAllEquipment()}
                  disabled={isLoading}
                  className="ml-auto" // 右寄せにする
                >
                  {isAllExpanded ? 'すべて閉じる' : 'すべて展開'}
                </Button>
              </div>
              {/* 部署全体の一括実施ボタン */}
              <Button
                onClick={() => handleOpenSubmitModal()}
                disabled={isLoading || isLoadingSubmit || isSubmittingAllDepartment || selectedCheckItemIds.size === 0 || !Array.from(selectedCheckItemIds).some(id => filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === id))) }
                className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto"
              >
                {isSubmittingAllDepartment ? '処理中...' : `選択中の全 ${Array.from(selectedCheckItemIds).filter(id => filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === id))).length} 項目を確認/記録`}
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filteredEquipment.length === 0 ? (
              <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
                <p className="text-muted-foreground mb-4">検索条件に一致する機器がありません</p>
                <Button variant="outline" onClick={() => { setSearchQuery(''); setShowOverdueOnly(false); }}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  検索条件をリセット
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredEquipment.map((equipment) => (
                  <Card key={equipment.id} className={`overflow-hidden ${equipment.pendingChecks! > 0 ? 'border-amber-300' : ''}`}>
                    <CardHeader className="bg-white p-4 cursor-pointer" onClick={() => toggleEquipment(equipment.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg font-semibold">{equipment.name}</CardTitle>
                          {equipment.pendingChecks! > 0 && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                              期限切れ: {equipment.pendingChecks}項目
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">{equipment.department_name}</p>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); toggleEquipment(equipment.id); }}>
                            {expandedEquipment[equipment.id] ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {expandedEquipment[equipment.id] && (
                      <CardContent className="p-0">
                        <div className="p-4 bg-gray-50">
                          {equipment.description && (
                            <p className="text-sm text-muted-foreground mb-2">{equipment.description}</p>
                          )}
                          
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="font-medium">点検項目</h3>
                            {equipment.checkItems && equipment.checkItems.length > 0 && (
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleSelectAllChecks(equipment.id, true); }}
                                >
                                  すべて選択
                                </Button>
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleSelectAllChecks(equipment.id, false); }}
                                >
                                  すべて解除
                                </Button>
                              </div>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => router.push(`/equipment_dash/edit/${equipment.id}`)}
                            >
                              <Settings className="mr-1 h-4 w-4" />
                              編集
                            </Button>
                          </div>
                          
                          {equipment.checkItems && equipment.checkItems.length > 0 ? (
                            <div className="space-y-2">
                              {equipment.checkItems.map((item) => (
                                <div 
                                  key={item.id} 
                                  className={`p-3 rounded-md flex justify-between items-center ${
                                    item.isOverdue ? 'bg-amber-50 border border-amber-200' : 'bg-white border'
                                  }`}
                                >
                                  <div className="flex items-center space-x-3">
                                    <Checkbox 
                                      id={`check-${item.id}`}
                                      checked={selectedCheckItemIds.has(item.id)}
                                      onCheckedChange={(checkedState) => {
                                        if (typeof checkedState === 'boolean') {
                                          handleCheckboxChange(item.id, checkedState);
                                        }
                                      }}
                                      aria-label={`Select ${item.name}`}
                                    />
                                    <Label htmlFor={`check-${item.id}`} className="flex-grow cursor-pointer">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{item.name}</span>
                                        <Badge className="text-xs">{frequencyToJapanese(item.frequency)}</Badge>
                                      </div>
                                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-4">
                                        <span className="flex items-center">
                                          <Calendar className="h-3.5 w-3.5 mr-1" />
                                          最終点検: {formatDateTime(item.lastCheckDate ?? null)}
                                        </span>
                                        {item.lastCheckResult !== null && (
                                          <span className="flex items-center">
                                            <span className={`mr-1 flex items-center justify-center w-4 h-4 rounded-full ${item.lastCheckResult ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                              {item.lastCheckResult ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                            </span>
                                            結果: {item.lastCheckResult ? '正常' : '異常'}
                                          </span>
                                        )}
                                      </div>
                                    </Label>
                                  </div>
                                </div>
                              ))}
                              <div className="mt-4 flex justify-end">
                                <Button
                                  onClick={(e) => { e.stopPropagation(); handleOpenSubmitModal(equipment.id); }}
                                  disabled={isLoadingSubmit || !Array.from(selectedCheckItemIds).some(id => equipment.checkItems?.some(item => item.id === id))}
                                  className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                                  size="sm"
                                >
                                  {`この機器で選択した ${Array.from(selectedCheckItemIds).filter(id => equipment.checkItems?.some(item => item.id === id)).length} 項目を確認/記録`}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-center text-muted-foreground py-4">
                              点検項目が登録されていません
                            </p>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* === 頻度別表示モード === */}
          <TabsContent value="frequency" className="mt-4">
            {renderFrequencyContent()}
          </TabsContent>
        </Tabs>

        {/* ★ 点検結果確認モーダル */} 
        <Dialog open={isSubmitModalOpen} onOpenChange={setIsSubmitModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>点検結果の確認・記録</DialogTitle>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto pr-6 space-y-4">
              {modalData.map((item) => (
                <div key={item.id} className="p-4 border rounded-md bg-white">
                  <p className="font-medium mb-2">{item.name} <span className="text-sm text-muted-foreground">({frequencyToJapanese(item.frequency)})</span></p>
                  <RadioGroup 
                    defaultValue="true" 
                    value={item.submitResult.toString()} 
                    onValueChange={(value: string) => handleModalDataChange(item.id, 'submitResult', value === 'true')}
                    className="flex gap-4 mb-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id={`result-ok-${item.id}`} />
                      <Label htmlFor={`result-ok-${item.id}`} className="text-green-700">正常</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id={`result-ng-${item.id}`} />
                      <Label htmlFor={`result-ng-${item.id}`} className="text-red-700">異常</Label>
                    </div>
                  </RadioGroup>
                  {item.submitResult === false && (
                    <Textarea 
                      placeholder="異常内容や対応を入力してください" 
                      value={item.submitComment || ''}
                      onChange={(e) => handleModalDataChange(item.id, 'submitComment', e.target.value)}
                      className="mt-2"
                      rows={3}
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button 
                onClick={handleSubmitFromModal}
                disabled={isLoadingSubmit || isSubmittingAllDepartment}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {isSubmittingAllDepartment ? '処理中...' : `${modalData.length}件の記録を実行`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
} 
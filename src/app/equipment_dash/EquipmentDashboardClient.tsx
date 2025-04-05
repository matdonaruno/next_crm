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
  FileText
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
  
  // フィルターと検索
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'equipment' | 'history'>('equipment');
  
  // データ読み込み中
  const [isLoading, setIsLoading] = useState(true);
  
  // セッション確認の無効化
  useEffect(() => {
    // コンポーネントのマウント時にセッション確認を無効化
    setSessionCheckEnabled(false);
    console.log("EquipmentDashboard: セッション確認を無効化しました");
    
    // クリーンアップ時（コンポーネントのアンマウント時）にセッション確認を再度有効化
    return () => {
      setSessionCheckEnabled(true);
      console.log("EquipmentDashboard: セッション確認を再有効化しました");
    };
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
          console.log('[DEBUG] Fetching check items for equipment IDs:', equipmentIds);
          const { data: checkItemsData, error: checkItemsError } = await supabase
            .from('equipment_check_items')
            .select('*')
            .in('equipment_id', equipmentIds)
            .order('name');
            
          if (checkItemsError) {
            console.error('[DEBUG] Check items fetch error:', checkItemsError);
            throw checkItemsError;
          }
          console.log('[DEBUG] Fetched check items data:', checkItemsData); // ★ 取得データ確認

          // 最新の点検記録を取得
          console.log('[DEBUG] Fetching latest maintenance records for equipment IDs:', equipmentIds);
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
          console.log('[DEBUG] Fetched maintenance records data:', recordsData); // ★ 取得データ確認
          
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
          console.log('[DEBUG] Check items with last check info:', checkItemsWithLastCheck); // ★ 処理後データ確認
          
          // 各機器に点検項目を関連付け
          formattedEquipment.forEach(equipment => {
            const items = checkItemsWithLastCheck.filter(item => item.equipment_id === equipment.id);
            equipment.checkItems = items;
            equipment.pendingChecks = items.filter(item => item.isOverdue).length;
            console.log(`[DEBUG] Associating items for equipment ${equipment.id}:`, items); // ★ 関連付け確認
          });
        }
        
        console.log('[DEBUG] Final formatted equipment list before setting state:', formattedEquipment); // ★ 最終データ確認
        setEquipmentList(formattedEquipment);
      } catch (error) {
        console.error('機器データ取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEquipmentAndRecords();
  }, [facilityId, selectedDepartmentId]);
  
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
  
  // 機器の展開/折りたたみを切り替え
  const toggleEquipment = (equipmentId: string) => {
    setExpandedEquipment(prev => ({
      ...prev,
      [equipmentId]: !prev[equipmentId]
    }));
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

  const [selectedCheckItemIds, setSelectedCheckItemIds] = useState<Set<string>>(new Set());
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);
  const [isSubmittingAllDepartment, setIsSubmittingAllDepartment] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalCheckItemData[]>([]);
  const [submittingFromModal, setSubmittingFromModal] = useState(false);

  // チェックボックス変更ハンドラ
  const handleCheckboxChange = (itemId: string, checked: any): void => {
    setSelectedCheckItemIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      console.log('[DEBUG] Selected items set:', newSet);
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

  // ★ 選択項目を一括点検実施 (モーダルを開く処理に変更)
  const handleOpenSubmitModal = (equipmentId: string | null = null) => {
    const itemsToProcess = Array.from(selectedCheckItemIds).filter(itemId => {
      if (equipmentId) {
        const equipment = equipmentList.find(eq => eq.id === equipmentId);
        return equipment?.checkItems?.some(item => item.id === itemId);
      } else {
        return filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === itemId));
      }
    });

    if (itemsToProcess.length === 0) {
      alert('点検する項目を選択してください。');
      return;
    }

    // モーダルに渡すデータを準備
    const dataForModal: ModalCheckItemData[] = [];
    itemsToProcess.forEach(itemId => {
      const equipment = equipmentList.find(eq => eq.checkItems?.some(item => item.id === itemId));
      const checkItem = equipment?.checkItems?.find(item => item.id === itemId);
      if (checkItem) {
        dataForModal.push({
          ...checkItem,
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

  // ★ モーダル内で結果やコメントが変更されたときのハンドラ
  const handleModalDataChange = (itemId: string, field: 'submitResult' | 'submitComment', value: boolean | string | null) => {
    setModalData(prev => prev.map(item => {
      if (item.id === itemId) {
        const newResult = field === 'submitResult' ? (value as boolean) : item.submitResult;
        const newComment = field === 'submitComment' ? (value as string) : item.submitComment;
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

      console.log('[DEBUG] Inserting records from modal:', recordsToInsert);

      const { data: insertedRecords, error } = await supabase
        .from('equipment_maintenance_records')
        .insert(recordsToInsert)
        .select();

      if (error) throw error;

      console.log('[DEBUG] Insert from modal success:', insertedRecords);

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

  // ★ 部署内の全項目を選択/解除するハンドラ (関数名を確認)
  const handleSelectAllDepartmentChecks = (select: boolean) => {
    // ... (関数本体は変更なし)
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
                      <span className="text-xs text-muted-foreground ml-2">
                        {notification.timestamp.toLocaleString()}
                      </span>
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
            <Button 
              onClick={() => router.push(`/equipment_dash/new?department=${encodeURIComponent(departmentName)}&departmentId=${encodeURIComponent(selectedDepartmentId !== 'all' ? selectedDepartmentId : departmentId)}`)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              新規機器登録
            </Button>
          </div>
        </div>
        
        {/* ★ 部署全体の一括操作ボタン */} 
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex gap-2">
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
          </div>
          <Button 
            onClick={() => handleOpenSubmitModal()}
            disabled={isLoading || isLoadingSubmit || isSubmittingAllDepartment || selectedCheckItemIds.size === 0 || !Array.from(selectedCheckItemIds).some(id => filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === id))) }
            className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto"
          >
            {`選択中の全 ${Array.from(selectedCheckItemIds).filter(id => filteredEquipment.some(eq => eq.checkItems?.some(item => item.id === id))).length} 項目を確認/記録`}
          </Button>
        </div>
        
        {/* 検索・フィルター部分 */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="機器名・部署名・点検項目で検索"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <div className="w-full md:w-auto">
              <Select value={selectedDepartmentId} onValueChange={handleDepartmentChange}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="部署を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部署</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center">
              <Button 
                variant={showOverdueOnly ? "secondary" : "outline"} 
                className={`text-sm w-full justify-start md:w-auto ${showOverdueOnly ? "bg-amber-100 text-amber-800 border-amber-300" : ""}`}
                onClick={() => setShowOverdueOnly(!showOverdueOnly)}
              >
                <AlertTriangle className={`mr-2 h-4 w-4 ${showOverdueOnly ? "text-amber-600" : "text-muted-foreground"}`} />
                期限切れのみ表示
              </Button>
            </div>
          </div>
        </div>
        
        {/* タブ */}
        <Tabs defaultValue="equipment" className="mb-6" value={activeTab} onValueChange={(value) => setActiveTab(value as 'equipment' | 'history')}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="equipment" className="text-base py-3">
              <Wrench className="mr-2 h-4 w-4" />
              機器一覧
            </TabsTrigger>
            <TabsTrigger value="history" className="text-base py-3">
              <FileText className="mr-2 h-4 w-4" />
              点検履歴
            </TabsTrigger>
          </TabsList>
          
          {/* 機器一覧タブコンテンツ */}
          <TabsContent value="equipment" className="mt-4">
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
                                  onClick={() => handleSelectAllChecks(equipment.id, true)}
                                >
                                  すべて選択
                                </Button>
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSelectAllChecks(equipment.id, false)}
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
                                        handleCheckboxChange(item.id, checkedState as boolean);
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
                                  onClick={() => handleOpenSubmitModal(equipment.id)}
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
          
          {/* 点検履歴タブコンテンツ */}
          <TabsContent value="history" className="mt-4">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="bg-white rounded-lg border shadow-sm p-12 text-center">
                <p className="text-muted-foreground">点検記録がありません</p>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>点検日時</TableHead>
                        <TableHead>機器名</TableHead>
                        <TableHead>点検項目</TableHead>
                        <TableHead>点検者</TableHead>
                        <TableHead>結果</TableHead>
                        <TableHead>コメント</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {new Date(record.performed_at).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>{record.equipment_name}</TableCell>
                          <TableCell>{record.check_item_name}</TableCell>
                          <TableCell>{record.performer_name}</TableCell>
                          <TableCell>
                            <Badge className={record.result ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}>
                              {record.result ? '正常' : '異常'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {record.comment || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
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
                disabled={submittingFromModal}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {submittingFromModal ? '処理中...' : `${modalData.length}件の記録を実行`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
} 
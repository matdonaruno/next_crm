// src/app/equipment_dash/EquipmentDashboardClient.tsx
'use client';

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Fragment,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/* ------------- supabase / 認証 ------------- */
import supabaseClient from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/* ------------- UI 共通 ------------- */
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';


/* ------------- Icon ------------- */
import {
  Plus,
  RefreshCw,
  Wrench,
  TableIcon,
  List,
  Grid,
  ChevronDown,
  ChevronUp,
  History,
  Calendar,
  Check,
  X,
  Settings,
  AlertTriangle,
} from 'lucide-react';

/* ------------- 型定義 & 共通ユーティリティ ------------- */
import {
  Equipment,
  EquipmentCheckItem,
  MaintenanceRecord,
  ModalCheckItemData,
  Profile,
  TableCellData,
  TableRowData,
  ViewMode,
} from './types';

import {
  frequencyToJapanese,
  formatDateTime,
  isCheckOverdue,
  isCurrentPeriodCompleted,
  isJapaneseHoliday,
  getHolidayName,
  getCurrentPeriodInfo,
} from './utils/dateUtils';

import {
  format,
  addDays,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  getMonth,
  getYear,
  subMonths,
  addMonths,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

/* ------------------------------------------------------------------ */
/*  Util ─ 点検項目を頻度でグループ化                                 */
/* ------------------------------------------------------------------ */
const groupCheckItemsByFrequency = (
  items: EquipmentCheckItem[] | undefined,
) => {
  const grouped: Record<
    'daily' | 'weekly' | 'monthly' | 'as_needed',
    EquipmentCheckItem[]
  > = {
    daily: [],
    weekly: [],
    monthly: [],
    as_needed: [],
  };
  (items ?? []).forEach((i) => grouped[i.frequency].push(i));
  return grouped;
};

/* ------------------------------------------------------------------ */
/*  メインコンポーネント                                              */
/* ------------------------------------------------------------------ */
export default function EquipmentDashboardClient() {
  /* === 認証 & ルーティング ====================================== */
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = supabaseClient;
  const router = useRouter();
  const query = useSearchParams();
  const departmentFromUrl = query?.get('departmentId') ?? '';

  /* === state ==================================================== */
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  /* filter / view */
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('equipment');
  const [selectedDept, setSelectedDept] = useState(departmentFromUrl || 'all');

  /* 展開管理 (equipment / frequency) */
  const [expandedEq, setExpandedEq] = useState<Record<string, boolean>>({});
  const [allEqOpen, setAllEqOpen] = useState(true);
  const [expandedFreq, setExpandedFreq] = useState<
    Record<string, boolean>
  >({
    daily: true,
    weekly: true,
    monthly: true,
    as_needed: true,
  });
  const [allFreqOpen, setAllFreqOpen] = useState(true);

  /* チェック項目 選択状態 */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* モーダル */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalCheckItemData[]>([]);
  const [modalSubmitting, setModalSubmitting] = useState(false);

  /* テーブル表示 月選択 */
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const dateRange = useMemo(
    () => ({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    }),
    [currentMonth],
  );

  /* === ページフォーカス時のリロード防止 ========================= */
  useEffect(() => {
    const handleVisibilityChange = () => {
      // ページが表示状態になったときの処理をスキップ
      // 必要に応じて手動リフレッシュボタンを使用
    };

    const handleFocus = () => {
      // ウィンドウフォーカス時のリロードを防止
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  /* === 初期データ取得 =========================================== */
  useEffect(() => {
    if (!user || !profile?.facility_id) return;

    (async () => {
      setLoading(true);
      try {
        /* 機器 + 点検項目 + 最新記録 */
        const { data, error } = await supabase
          .from('equipment')
          .select(
            `
          *,
          departments(name),
          equipment_check_items(*),
          equipment_maintenance_records:equipment_maintenance_records(
            *,
            performer:profiles(fullname)
          )
        `,
          )
          .eq('facility_id', profile.facility_id);


        const eq: Equipment[] = (data ?? []).map((e) => {
          /* 最新記録取得用 Map */
          const latestMap = new Map<
            string,
            { performed_at: string; result: boolean; comment: string | null }
          >();
          (e.equipment_maintenance_records as MaintenanceRecord[]).forEach(
            (r) => {
              if (!latestMap.has(r.check_item_id)) {
                latestMap.set(r.check_item_id, {
                  performed_at: r.performed_at,
                  result: r.result,
                  comment: r.comment,
                });
              }
            },
          );

          const items = (e.equipment_check_items as EquipmentCheckItem[]).map(
            (i) => {
              const last = latestMap.get(i.id);
              return {
                ...i,
                lastCheckDate: last?.performed_at ?? null,
                lastCheckResult: last?.result ?? null,
                isOverdue: isCheckOverdue(
                  last?.performed_at ?? null,
                  i.frequency,
                ),
                isPeriodCompleted: isCurrentPeriodCompleted(
                  last?.performed_at ?? null,
                  i.frequency,
                ),
              };
            },
          );

          return {
            id: e.id,
            name: e.name,
            description: e.description,
            facility_id: e.facility_id,
            department_id: e.department_id,
            created_at: e.created_at,
            updated_at: e.updated_at,
            department_name: e.departments?.name ?? '',
            checkItems: items,
            pendingChecks: items.filter((i) => i.isOverdue).length,
          };
        });


        // 部署フィルタリングのデバッグ情報（開発時のみ）
        if (process.env.NODE_ENV === 'development') {
          console.log('equipment_dash: 部署フィルタリング調査', {
            urlDepartmentId: departmentFromUrl,
            allDepartmentIds: [...new Set(eq.map(e => e.department_id))],
            matchingEquipment: eq.filter(e => e.department_id === departmentFromUrl).length
          });
        }

        setEquipment(eq);

        /* 履歴用レコード */
        setRecords(
          (data ?? [])
            .flatMap((e) => e.equipment_maintenance_records as MaintenanceRecord[])
            .sort(
              (a, b) =>
                new Date(b.performed_at).getTime() -
                new Date(a.performed_at).getTime(),
            ),
        );
      } catch (e) {
        console.error('fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, profile?.facility_id]);

  /* === URLパラメータの変更監視 ================================ */
  useEffect(() => {
    setSelectedDept(departmentFromUrl || 'all');
  }, [departmentFromUrl]);

  /* === 機器展開の自動化 ======================================== */
  useEffect(() => {
    if (equipment.length > 0) {
      const expandAll = Object.fromEntries(equipment.map(e => [e.id, true]));
      setExpandedEq(expandAll);
    }
  }, [equipment]);

  /* === フィルタリング ========================================== */
  const filteredEquipment = useMemo(() => {
    const q = search.toLowerCase();
    let filtered = equipment.filter((e) => {
      const inDept = selectedDept === 'all' || e.department_id === selectedDept;
      const inSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.checkItems?.some((i) => i.name.toLowerCase().includes(q));
      return inDept && inSearch;
    });
    
    // フィルタリング結果が0件かつ部署指定の場合、全件表示にフォールバック
    if (filtered.length === 0 && selectedDept !== 'all' && equipment.length > 0) {
      console.warn('equipment_dash: 指定部署に機器が見つからないため、全機器を表示します', {
        specifiedDeptId: selectedDept,
        availableDeptIds: [...new Set(equipment.map(e => e.department_id))]
      });
      filtered = equipment.filter((e) => {
        const inSearch =
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.checkItems?.some((i) => i.name.toLowerCase().includes(q));
        return inSearch;
      });
    }
    
    // フィルタリング結果のデバッグ情報（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log('equipment_dash: フィルタリング処理', {
        selectedDept,
        originalCount: equipment.length,
        filteredCount: filtered.length,
        filterMode: selectedDept === 'all' ? 'すべて表示' : '部署フィルタ'
      });
    }
    
    return filtered;
  }, [equipment, search, selectedDept]);

  /* === Equipment 展開/閉じる ==================================== */
  const toggleEquipment = (id: string) =>
    setExpandedEq((p) => ({ ...p, [id]: !p[id] }));
  const toggleAllEquipment = () => {
    const next = !allEqOpen;
    setAllEqOpen(next);
    setExpandedEq(
      Object.fromEntries(filteredEquipment.map((e) => [e.id, next])),
    );
  };

  /* === Frequency 展開/閉じる ==================================== */
  const toggleFreq = (freq: string) =>
    setExpandedFreq((p) => ({ ...p, [freq]: !p[freq] }));
  const toggleAllFreq = () => {
    const next = !allFreqOpen;
    setAllFreqOpen(next);
    setExpandedFreq({
      daily: next,
      weekly: next,
      monthly: next,
      as_needed: next,
    });
  };

  /* === チェックボックス ========================================= */
  const handleCheck = (id: string, checked: boolean) =>
    setSelectedIds((p) => {
      const s = new Set(p);
      checked ? s.add(id) : s.delete(id);
      return s;
    });

  // すべて選択機能
  const selectAllItems = (items: string[]) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      items.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // すべて選択解除機能
  const deselectAllItems = (items: string[]) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      items.forEach(id => newSet.delete(id));
      return newSet;
    });
  };

  // タブ内全項目選択機能
  const selectAllVisibleItems = () => {
    const allVisibleIds: string[] = [];
    filteredEquipment.forEach((eq) => {
      eq.checkItems?.forEach((item) => {
        allVisibleIds.push(item.id);
      });
    });
    selectAllItems(allVisibleIds);
  };

  // タブ内全項目選択解除機能
  const deselectAllVisibleItems = () => {
    const allVisibleIds: string[] = [];
    filteredEquipment.forEach((eq) => {
      eq.checkItems?.forEach((item) => {
        allVisibleIds.push(item.id);
      });
    });
    deselectAllItems(allVisibleIds);
  };

  /* === モーダル開閉 ============================================ */
  const openModal = (ids: string[]) => {
    if (ids.length === 0) {
      alert('項目を選択してください');
      return;
    }
    const data: ModalCheckItemData[] = [];
    equipment.forEach((eq) =>
      eq.checkItems?.forEach((i) => {
        if (ids.includes(i.id))
          data.push({ ...i, submitResult: true, submitComment: null });
      }),
    );
    setModalData(data);
    setModalOpen(true);
  };

  /* === モーダル登録 ============================================ */
  const submitModal = async () => {
    if (!user) return;
    setModalSubmitting(true);
    try {
      const rows = modalData.map((d) => ({
        check_item_id: d.id,
        equipment_id: d.equipment_id,
        performed_by: user.id,
        performed_at: new Date().toISOString(),
        result: d.submitResult,
        comment: d.submitResult ? null : d.submitComment,
      }));
      const { error } = await supabase
        .from('equipment_maintenance_records')
        .insert(rows);
      if (error) throw error;
      alert(`${rows.length} 件を記録しました`);
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setModalSubmitting(false);
    }
  };

  /* === テーブル用データ ======================================== */
  const tableData = useMemo(() => {
    const dates = eachDayOfInterval(dateRange).map((d) =>
      format(d, 'yyyy-MM-dd'),
    );
    const rows: TableRowData[] = [];
    const recMap = new Map<string, TableCellData>();
    records.forEach((r) => {
      const k = `${format(new Date(r.performed_at), 'yyyy-MM-dd')}_${r.check_item_id}`;
      if (!recMap.has(k))
        recMap.set(k, {
          result: r.result,
          recordId: r.id,
          comment: r.comment,
        });
    });

    filteredEquipment.forEach((eq) => {
      rows.push({
        type: 'equipment',
        id: eq.id,
        equipmentName: eq.name,
        cells: {},
      });
      Object.entries(groupCheckItemsByFrequency(eq.checkItems)).forEach(
        ([freq, items]) => {
          rows.push({
            type: 'frequency',
            id: `${eq.id}-${freq}`,
            frequency: frequencyToJapanese(freq),
            cells: {},
          });
          items.forEach((i) => {
            const cells: Record<string, TableCellData> = {};
            dates.forEach((d) => {
              const k = `${d}_${i.id}`;
              cells[d] = recMap.get(k) ?? { result: null };
            });
            rows.push({
              type: 'item',
              id: i.id,
              itemName: i.name,
              equipmentName: eq.name,
              cells,
            });
          });
        },
      );
    });

    return { dates, rows };
  }, [filteredEquipment, records, dateRange]);

  /* === 描画 ===================================================== */
  if (authLoading || loading)
    return <LoadingSpinner message="機器データを読み込み中..." fullScreen />;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        <AppHeader
          title="Equipment Manager"
          showBackButton
          icon={<Wrench className="h-6 w-6 text-emerald-500" />}
        />

        <div className="container max-w-6xl mx-auto p-4">
          {/* ヘッダー操作 */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-primary">
                Equipment Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                {profile?.fullname || user?.email?.split('@')[0] || 'User'}さん
              </p>
              {selectedDept !== 'all' && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-blue-600">
                    📍 部署フィルタ適用中 ({filteredEquipment.length}件の機器)
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedDept('all')}
                    className="text-xs h-6 px-2"
                  >
                    全機器表示
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Input
                placeholder="検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40"
              />
              <Button
                onClick={() =>
                  router.push(
                    `/equipment_dash/new?departmentId=${selectedDept ?? ''}`,
                  )
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                新規機器
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setLoading(true);
                  window.location.reload();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                更新
              </Button>
            </div>
          </div>

          {/* タブ */}
          <Tabs
            value={viewMode}
            onValueChange={(v: string) => setViewMode(v as ViewMode)}
          >
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="table">
                <TableIcon className="h-4 w-4 mr-1" />
                テーブル
              </TabsTrigger>
              <TabsTrigger value="equipment">
                <List className="h-4 w-4 mr-1" />
                機器別
              </TabsTrigger>
              <TabsTrigger value="frequency">
                <Grid className="h-4 w-4 mr-1" />
                頻度別
              </TabsTrigger>
            </TabsList>

            {/* === TABLE ===================================================== */}
            <TabsContent value="table">
              <div className="max-w-7xl mx-auto px-4">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {format(dateRange.start, 'yyyy/MM')} の点検記録
                    </CardTitle>
                  </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-white z-10 w-56">
                          機器 / 項目
                        </TableHead>
                        {tableData.dates.map((d) => {
                          const dateObj = new Date(`${d}T00:00:00`);
                          const w = format(dateObj, 'E', { locale: ja });
                          const isSat = w === '土';
                          const isSun = w === '日';
                          const hol = isJapaneseHoliday(dateObj);
                          const bg = hol
                            ? 'bg-pink-50'
                            : isSun
                            ? 'bg-red-50'
                            : isSat
                            ? 'bg-blue-50'
                            : '';
                          const color = hol
                            ? 'text-pink-600'
                            : isSun
                            ? 'text-red-600'
                            : isSat
                            ? 'text-blue-600'
                            : 'text-gray-400';
                          return (
                            <TableHead
                              key={d}
                              className={`w-12 text-center ${bg}`}
                            >
                              <div>{format(dateObj, 'd')}</div>
                              <div className={`text-xs ${color}`}>{w}</div>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.rows.map((row) => {
                        if (row.type === 'equipment')
                          return (
                            <TableRow key={row.id} className="bg-gray-100">
                              <TableCell className="sticky left-0 bg-gray-100 font-semibold">
                                {row.equipmentName}
                              </TableCell>
                              <TableCell colSpan={tableData.dates.length} />
                            </TableRow>
                          );
                        if (row.type === 'frequency')
                          return (
                            <TableRow key={row.id} className="bg-gray-50">
                              <TableCell className="sticky left-0 bg-gray-50 pl-6">
                                {row.frequency}
                              </TableCell>
                              <TableCell colSpan={tableData.dates.length} />
                            </TableRow>
                          );
                        /* item */
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="sticky left-0 bg-white pl-9">
                              {row.itemName}
                            </TableCell>
                            {tableData.dates.map((d) => {
                              const cell = row.cells[d];
                              return (
                                <TableCell
                                  key={`${row.id}-${d}`}
                                  className="text-center"
                                >
                                  {cell.result === true ? (
                                    <Check className="h-4 w-4 text-green-500 inline-block" />
                                  ) : cell.result === false ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <X className="h-4 w-4 text-red-500 inline-block cursor-pointer" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {cell.comment || '異常'}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* === EQUIPMENT ================================================ */}
            <TabsContent value="equipment">
              <div className="max-w-3xl mx-auto px-4">
                <div className="flex items-center gap-3 mb-4">
                  <Button variant="outline" size="sm" onClick={toggleAllEquipment}>
                    {allEqOpen ? 'すべて閉じる' : 'すべて展開'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    選択解除
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisibleItems}
                    className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    全て選択
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAllVisibleItems}
                    className="bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                  >
                    全て解除
                  </Button>
                  <Button
                    disabled={selectedIds.size === 0}
                    onClick={() => openModal(Array.from(selectedIds))}
                  >
                    選択 {selectedIds.size} 件を記録
                  </Button>
                </div>

                {filteredEquipment.map((eq) => (
                  <Card key={eq.id} className="mb-4">
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => toggleEquipment(eq.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-primary" />
                        <CardTitle>{eq.name}</CardTitle>
                        {eq.pendingChecks! > 0 && (
                          <Badge variant="destructive">
                            期限切れ {eq.pendingChecks}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {expandedEq[eq.id] && eq.checkItems && eq.checkItems.length > 0 && (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllItems(eq.checkItems?.map(item => item.id) || [])}
                              className="text-xs h-7 px-2"
                            >
                              全選択
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deselectAllItems(eq.checkItems?.map(item => item.id) || [])}
                              className="text-xs h-7 px-2"
                            >
                              全解除
                            </Button>
                          </div>
                        )}
                        <ChevronDown
                          className={`h-5 w-5 transition-transform ${
                            expandedEq[eq.id] ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  {expandedEq[eq.id] && (
                    <CardContent className="px-4 py-6">
                      <div className="space-y-3 pl-8">
                        {eq.checkItems?.map((i) => (
                          <div
                            key={i.id}
                            className={`p-3 border rounded-lg shadow-sm ${
                              i.isOverdue
                                ? 'bg-amber-50 border-amber-200'
                                : i.isPeriodCompleted
                                ? 'bg-green-50 border-green-200'
                                : ''
                            }`}
                          >
                            <div className="grid grid-cols-12 gap-3 items-start">
                              <div className="col-span-1">
                                <Checkbox
                                  checked={selectedIds.has(i.id)}
                                  onCheckedChange={(c: boolean) =>
                                    handleCheck(i.id, !!c)
                                  }
                                  className="mt-1"
                                />
                              </div>
                              <div className="col-span-7">
                                <div className="flex flex-col gap-1">
                                  <span className="font-medium text-left">{i.name}</span>
                                  <Badge className="self-start w-fit">{frequencyToJapanese(i.frequency)}</Badge>
                                </div>
                              </div>
                              <div className="col-span-4 text-right">
                                <div className="text-sm text-muted-foreground">
                                  最終: {formatDateTime(i.lastCheckDate ?? null)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {eq.checkItems?.length === 0 && (
                          <p className="text-left text-muted-foreground ml-4">
                            項目なし
                          </p>
                        )}
                      </div>
                    </CardContent>
                  )}
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* === FREQUENCY =============================================== */}
            <TabsContent value="frequency">
              <div className="max-w-3xl mx-auto px-4">
                <div className="flex items-center gap-3 mb-4">
                  <Button variant="outline" size="sm" onClick={toggleAllFreq}>
                    {allFreqOpen ? 'すべて閉じる' : 'すべて展開'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    選択解除
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisibleItems}
                    className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    全て選択
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAllVisibleItems}
                    className="bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                  >
                    全て解除
                  </Button>
                  <Button
                    disabled={selectedIds.size === 0}
                    onClick={() => openModal(Array.from(selectedIds))}
                  >
                    選択 {selectedIds.size} 件を記録
                  </Button>
                </div>

                {/* freq block */}
                {(['daily', 'weekly', 'monthly', 'as_needed'] as const).map(
                (f) => {
                  /* 該当項目 */
                  const items: Array<{
                    equipment: Equipment;
                    item: EquipmentCheckItem;
                  }> = [];
                  filteredEquipment.forEach((eq) =>
                    eq.checkItems
                      ?.filter((i) => i.frequency === f)
                      .forEach((i) => items.push({ equipment: eq, item: i })),
                  );
                  if (items.length === 0) return null;

                  const overdueCnt = items.filter(
                    (it) => it.item.isOverdue,
                  ).length;
                  return (
                    <Card key={f} className="mb-4">
                      <CardHeader
                        className="cursor-pointer"
                        onClick={() => toggleFreq(f)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <CardTitle>
                              {frequencyToJapanese(f)} 点検
                            </CardTitle>
                            {overdueCnt > 0 && (
                              <Badge variant="destructive">
                                期限切れ {overdueCnt}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {expandedFreq[f] && items.length > 0 && (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => selectAllItems(items.map(item => item.item.id))}
                                  className="text-xs h-7 px-2"
                                >
                                  全選択
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deselectAllItems(items.map(item => item.item.id))}
                                  className="text-xs h-7 px-2"
                                >
                                  全解除
                                </Button>
                              </div>
                            )}
                            <ChevronDown
                              className={`h-5 w-5 transition-transform ${
                                expandedFreq[f] ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>
                      </CardHeader>

                      {expandedFreq[f] && (
                        <CardContent className="px-4 py-6">
                          <div className="space-y-3 pl-8">
                            {items.map(({ equipment: eq, item: i }) => (
                              <div
                                key={i.id}
                                className={`p-3 border rounded-lg shadow-sm ${
                                  i.isOverdue
                                    ? 'bg-amber-50 border-amber-200'
                                    : i.isPeriodCompleted
                                    ? 'bg-green-50 border-green-200'
                                    : ''
                                }`}
                              >
                                <div className="grid grid-cols-12 gap-3 items-start">
                                  <div className="col-span-1">
                                    <Checkbox
                                      checked={selectedIds.has(i.id)}
                                      onCheckedChange={(c: boolean) =>
                                        handleCheck(i.id, !!c)
                                      }
                                      className="mt-1"
                                    />
                                  </div>
                                  <div className="col-span-7">
                                    <div className="flex flex-col gap-1">
                                      <span className="font-medium text-left">{i.name}</span>
                                      <Badge className="self-start w-fit">{eq.name}</Badge>
                                    </div>
                                  </div>
                                  <div className="col-span-4 text-right">
                                    <div className="text-sm text-muted-foreground">
                                      最終: {formatDateTime(i.lastCheckDate ?? null)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                },
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* === モーダル ================================================ */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>点検結果の記録</DialogTitle>
            </DialogHeader>

            <div className="flex-grow overflow-y-auto pr-4 space-y-4">
              {modalData.map((d) => (
                <div key={d.id} className="border rounded p-4 space-y-2">
                  <div className="font-semibold text-gray-900">
                    {d.name} ({frequencyToJapanese(d.frequency)})
                  </div>
                  <RadioGroup
                    value={d.submitResult.toString()}
                    onValueChange={(v: string) =>
                      setModalData((p) =>
                        p.map((m) =>
                          m.id === d.id
                            ? {
                                ...m,
                                submitResult: v === 'true',
                                submitComment:
                                  v === 'true' ? null : m.submitComment,
                              }
                            : m,
                        ),
                      )
                    }
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="true" id={`ok-${d.id}`} />
                      <Label htmlFor={`ok-${d.id}`} className="text-gray-900 font-medium">正常</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="false" id={`ng-${d.id}`} />
                      <Label htmlFor={`ng-${d.id}`} className="text-gray-900 font-medium">異常</Label>
                    </div>
                  </RadioGroup>
                  {d.submitResult === false && (
                    <Textarea
                      placeholder="異常内容を入力してください"
                      value={d.submitComment ?? ''}
                      onChange={(e) =>
                        setModalData((p) =>
                          p.map((m) =>
                            m.id === d.id
                              ? { ...m, submitComment: e.target.value }
                              : m,
                          ),
                        )
                      }
                      onFocus={(e) => {
                        if (e.target.placeholder === "異常内容を入力してください") {
                          e.target.placeholder = "";
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          e.target.placeholder = "異常内容を入力してください";
                        }
                      }}
                      className="text-gray-900 placeholder:text-gray-400 border-gray-300 focus:border-primary focus:ring-primary"
                      rows={3}
                    />
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button
                disabled={modalSubmitting}
                onClick={submitModal}
                className="bg-primary text-white"
              >
                {modalSubmitting ? '登録中...' : '登録'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

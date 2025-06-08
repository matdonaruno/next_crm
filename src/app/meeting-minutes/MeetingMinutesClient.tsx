'use client';

import { useRouter } from 'next/navigation';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  MouseEvent,
} from 'react';
import {
  Mic,
  Plus,
  Search,
  FileText,
  Calendar,
  ChevronRight,
  MessageSquare,
  Clock,
  Filter,
  UserCircle,
  Users,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Lock,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { useAuthContext } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';

import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingSpinner, CompactLoadingSpinner, ButtonSpinner } from '@/components/common/LoadingSpinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSupabase } from '@/app/_providers/supabase-provider';
import type { MeetingMinuteRow } from '@/types/meeting-minutes';

/**
 * Supabase から取得した `meeting_minutes` テーブルの行に
 * JOIN などで付加された “便利カラム” をマージした型。
 * - `recorded_by_name` : profiles との結合で取得する記録者名
 * - `creator_info`     : JSON 文字列で持っている作成者メタ
 * - `meeting_types`    : meeting_types テーブルとの結合結果（name だけ使う）
 */
type MeetingMinute = MeetingMinuteRow & {
  recorded_by_name?: string | null;
  creator_info?: string | null;
  meeting_types?: { name: string } | null;
};

/* UI helpers */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 350, damping: 25 },
  },
};

const BackgroundElements = () => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
    {/* gradient blobs */}
    <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-indigo-200/20 to-purple-200/20 blur-3xl -translate-x-1/3 -translate-y-1/3" />
    <div className="absolute bottom-0 right-0 w-[700px] h-[700px] rounded-full bg-gradient-to-l from-sky-200/15 to-blue-200/15 blur-3xl translate-x-1/4 translate-y-1/4" />
    <div className="absolute bottom-1/2 left-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-tl from-violet-200/10 to-fuchsia-200/10 blur-3xl -translate-x-1/2 translate-y-1/2" />

    {/* floating particles */}
    {Array.from({ length: 25 }).map((_, i) => (
      <div
        key={`p-${i}`}
        className="absolute rounded-full bg-white"
        style={{
          width: `${Math.random() * 4 + 1}px`,
          height: `${Math.random() * 4 + 1}px`,
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          opacity: Math.random() * 0.25 + 0.05,
          boxShadow: '0 0 4px rgba(255,255,255,0.6)',
          animation: `float ${Math.random() * 20 + 15}s linear infinite`,
          animationDelay: `${Math.random() * 5}s`,
        }}
      />
    ))}

    {/* light lines */}
    <div className="absolute top-0 left-0 w-full h-full opacity-10">
      {[10, 35, 65, 85].map((t) => (
        <div
          key={`l-${t}`}
          className="absolute left-0 w-full h-[1px]"
          style={{
            top: `${t}%`,
            backgroundImage:
              'linear-gradient(to right, transparent, rgba(124, 58, 237, 0.4), transparent)',
          }}
        />
      ))}
    </div>
  </div>
);

const DynamicBackgroundElements = dynamic(
  () => Promise.resolve(BackgroundElements),
  { loading: () => <CompactLoadingSpinner message="背景要素を読み込み中..." /> },
);

const MeetingSearchChatbot = dynamic(
  () => import('@/components/MeetingSearchChatbot'),
  { loading: () => <CompactLoadingSpinner message="チャットボットを読み込み中..." /> },
);

type TabValue = 'all' | 'recent' | 'recorded';

export default function MeetingMinutesClient() {
  const router = useRouter();
  const { toast } = useToast();
  const { supabase } = useSupabase();

  /* auth */
  const { user, profile } = useAuthContext();
  const currentFacilityIdFromProfile = profile?.facility_id ?? null;

  /* state */
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinute[]>([]);
  const [filteredMeetingMinutes, setFilteredMeetingMinutes] = useState<
    MeetingMinute[]
  >([]);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [needsFacilityIdFix, setNeedsFacilityIdFix] = useState(false);
  const [isFixingFacilityId, setIsFixingFacilityId] = useState(false);
  const [currentFacilityId, setCurrentFacilityId] = useState<string | null>(
    currentFacilityIdFromProfile,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingMinuteId, setDeletingMinuteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  /* cache refs */
  const cachedData = useRef<Record<string, MeetingMinute[]>>({});
  const lastFetchTime = useRef<Record<string, number>>({});
  const isFetchingRef = useRef(false);

  /* helper callbacks */
  const invalidateCache = useCallback(() => {
    if (!currentFacilityId) return;
    delete cachedData.current[currentFacilityId];
    delete lastFetchTime.current[currentFacilityId];
  }, [currentFacilityId]);


  const fetchMeetingMinutes = useCallback(
    async (force = false) => {
      if (!currentFacilityId || isFetchingRef.current) return;

      const cache = cachedData.current[currentFacilityId];
      const cachedAt = lastFetchTime.current[currentFacilityId] ?? 0;
      const valid = cache && Date.now() - cachedAt < 5 * 60_000 && !force;

      if (valid) {
        setMeetingMinutes(cache);
        setFilteredMeetingMinutes(cache);
        setTimeout(() => fetchMeetingMinutes(true), 100);
        return;
      }

      if (!cache) setIsLoading(true);
      isFetchingRef.current = true;

      try {
        const res = await fetch(
          `/api/meeting-minutes?facilityId=${currentFacilityId}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const data: MeetingMinute[] = await res.json();
        cachedData.current[currentFacilityId] = data;
        lastFetchTime.current[currentFacilityId] = Date.now();
        setMeetingMinutes(data);
        setFilteredMeetingMinutes(data);
      } catch (e) {
        toast({
          title: 'データ取得エラー',
          description: e instanceof Error ? e.message : '取得に失敗しました',
          variant: 'destructive',
        });
        setMeetingMinutes([]);
        setFilteredMeetingMinutes([]);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [currentFacilityId, toast],
  );

  const fixFacilityIds = useCallback(async () => {
    if (!currentFacilityId) return;

    setIsFixingFacilityId(true);
    try {
      const { data, error } = await supabase
        .from('meeting_minutes')
        .select('id')
        .neq('facility_id', currentFacilityId);
      if (error) throw error;

      if (!data?.length) {
        toast({ title: '修正不要', description: '不一致はありません' });
        setNeedsFacilityIdFix(false);
        return;
      }
      
      const { error: upErr } = await supabase
        .from('meeting_minutes')
        .update({ facility_id: currentFacilityId })
        .in(
          'id',
          data.map((d: { id: string }) => d.id),
        );
      if (upErr) throw upErr;

      toast({
        title: '修正完了',
        description: `${data.length} 件の施設IDを修正しました`,
      });
      invalidateCache();
      fetchMeetingMinutes(true);
      setNeedsFacilityIdFix(false);
    } catch (e) {
      toast({
        title: 'エラー',
        description: e instanceof Error ? e.message : '修正に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsFixingFacilityId(false);
    }
  }, [currentFacilityId, fetchMeetingMinutes, invalidateCache, supabase, toast]);

  const fixCreators = useCallback(async () => {
    try {
      const res = await fetch('/api/meeting-minutes/fix-creators', {
        method: 'POST',
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'APIエラー');
      }
      
      const result = await res.json();
      
      toast({ 
        title: '作成者修正完了', 
        description: result.message 
      });
      
      // データを再取得
      invalidateCache();
      await fetchMeetingMinutes(true);
      
    } catch (e) {
      toast({
        title: '作成者修正エラー',
        description: e instanceof Error ? e.message : '修正に失敗しました',
        variant: 'destructive',
      });
    }
  }, [toast, invalidateCache, fetchMeetingMinutes]);

  const createTestData = useCallback(async () => {
    try {
      const res = await fetch('/api/meeting-minutes/test-data', {
        method: 'POST',
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'APIエラー');
      }
      
      const result = await res.json();
      
      toast({ 
        title: 'テストデータ作成完了', 
        description: result.message 
      });
      
      // データを再取得
      invalidateCache();
      await fetchMeetingMinutes(true);
      
    } catch (e) {
      toast({
        title: 'テストデータ作成エラー',
        description: e instanceof Error ? e.message : '作成に失敗しました',
        variant: 'destructive',
      });
    }
  }, [toast, invalidateCache, fetchMeetingMinutes]);

  const deleteMeetingMinute = useCallback(async () => {
    if (!deletingMinuteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/meeting-minutes/${deletingMinuteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error);

      setMeetingMinutes((prev) => prev.filter((m) => m.id !== deletingMinuteId));
      setFilteredMeetingMinutes((prev) =>
        prev.filter((m) => m.id !== deletingMinuteId),
      );
      invalidateCache();
      toast({ title: '削除完了', description: '議事録を削除しました' });
    } catch (e) {
      toast({
        title: 'エラー',
        description: e instanceof Error ? e.message : '削除に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeletingMinuteId(null);
      setIsDeleteDialogOpen(false);
    }
  }, [deletingMinuteId, invalidateCache, toast]);

  /* ----------------------------- side-effects ----------------------------- */

  useEffect(() => {
    // プロファイルが届いたら facility_id と role を反映
    if (profile) {
      setCurrentFacilityId(profile.facility_id ?? null);
      setUserRole(profile.role ?? null);
    } else {
      setCurrentFacilityId(null);
      setUserRole(null);
    }
  }, [profile]);

  useEffect(() => {
    if (currentFacilityId) fetchMeetingMinutes();
  }, [currentFacilityId, fetchMeetingMinutes]);

  // 処理中の議事録があるときは定期的にリフレッシュ
  useEffect(() => {
    const hasProcessingItems = meetingMinutes.some(m => m.processing_status === 'processing');
    
    if (!hasProcessingItems) return;

    const interval = setInterval(() => {
      console.log('[MeetingMinutes] 処理中項目あり、一覧をリフレッシュ');
      fetchMeetingMinutes(true);
    }, 10000); // 10秒ごと

    return () => clearInterval(interval);
  }, [meetingMinutes, fetchMeetingMinutes]);

  useEffect(() => {
    if (!meetingMinutes.length) return;
    const filtered = meetingMinutes.filter((m) => {
      const keyword = searchTerm.toLowerCase();
      const matchText =
        !keyword ||
        m.title.toLowerCase().includes(keyword) ||
        m.content?.toLowerCase().includes(keyword) ||
        m.summary?.toLowerCase().includes(keyword);

      if (activeTab === 'recent') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return matchText && new Date(m.meeting_date) >= weekAgo;
      }
      if (activeTab === 'recorded') return matchText && m.is_transcribed;
      return matchText;
    });
    setFilteredMeetingMinutes(filtered);
  }, [searchTerm, meetingMinutes, activeTab]);

  useEffect(() => {
    if (currentFacilityId && meetingMinutes.length) {
      setNeedsFacilityIdFix(
        meetingMinutes.some((m) => m.facility_id !== currentFacilityId),
      );
    }
  }, [currentFacilityId, meetingMinutes]);

  /* -------------------------- permission helper --------------------------- */

  const canDeleteMeetingMinute = (m: MeetingMinute) => {
    if (!user) return false;
    if (['admin', 'superuser'].includes(userRole ?? '')) return true;
    if (m.recorded_by === user.id) return true;
    try {
      return JSON.parse(m.creator_info ?? '{}').id === user.id;
    } catch {
      return false;
    }
  };

  /* --------------------------------  UI  --------------------------------- */

  return (
    <div className="flex flex-col min-h-screen bg-white relative">
      <DynamicBackgroundElements />

      <AppHeader
        title="会議議事録"
        icon={<Mic className="h-5 w-5 text-indigo-600" />}
        showBackButton
        onBackClick={() => router.push('/depart')}
        className="bg-white/90 backdrop-blur-xl border-b border-slate-100/80 shadow-sm z-20"
      />

      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col px-4 md:px-6 lg:px-8 py-4 relative z-10">
        {/* search & filter */}
        <div className="mb-6 sticky top-[53px] bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-100/80 shadow-sm p-4 z-10">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="議事録を検索..."
                className="pl-10 h-11 bg-white/80 rounded-xl border-slate-200 shadow-sm focus-visible:ring-indigo-500"
              />
            </div>

            <Button
              onClick={() => router.push('/meeting-minutes/create')}
              className="h-11 px-5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-md hover:shadow-lg transition"
            >
              <Plus className="h-4 w-4 mr-2" />
              新規作成
            </Button>
          </div>

          <div className="mt-4">
            <Tabs
              value={activeTab}
              /* ★ 型キャストで一致させる */
              onValueChange={(v) => setActiveTab(v as TabValue)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 bg-slate-100/80 p-1 rounded-xl h-11">
                <TabsTrigger value="all" className="h-9 rounded-lg">
                  <FileText className="h-4 w-4 mr-2" />
                  すべて
                </TabsTrigger>
                <TabsTrigger value="recent" className="h-9 rounded-lg">
                  <Clock className="h-4 w-4 mr-2" />
                  最近
                </TabsTrigger>
                <TabsTrigger value="recorded" className="h-9 rounded-lg">
                  <Mic className="h-4 w-4 mr-2" />
                  録音済
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* facilityId fix */}
        {needsFacilityIdFix && (
          <div className="mb-5">
            <Button
              variant="outline"
              disabled={isFixingFacilityId}
              onClick={fixFacilityIds}
              className="w-full h-11 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 rounded-xl shadow-sm"
            >
              {isFixingFacilityId ? (
                <>
                  <ButtonSpinner className="h-4 w-4 mr-2" />
                  施設ID修正中...
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4 mr-2" />
                  施設IDが一致していないレコードを修正
                </>
              )}
            </Button>
          </div>
        )}

        {/* creator fix for admin users */}
        {['facility_admin', 'superuser'].includes(userRole ?? '') && (
          <>
            <div className="mb-5">
              <Button
                variant="outline"
                onClick={fixCreators}
                className="w-full h-11 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 rounded-xl shadow-sm"
              >
                <UserCircle className="h-4 w-4 mr-2" />
                作成者不明の議事録を修正
              </Button>
            </div>
            <div className="mb-5">
              <Button
                variant="outline"
                onClick={createTestData}
                className="w-full h-11 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 rounded-xl shadow-sm"
              >
                <FileText className="h-4 w-4 mr-2" />
                検索テスト用データを作成
              </Button>
            </div>
          </>
        )}

        {/* list */}
        <ScrollArea className="flex-1 h-[calc(100vh-250px)] pb-20">
          {isLoading ? (
            <div className="py-16">
              <CompactLoadingSpinner message="データを読み込み中..." />
            </div>
          ) : filteredMeetingMinutes.length === 0 ? (
            <div className="text-center py-16 bg-white/90 rounded-2xl p-8 shadow-sm border border-slate-100">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-50 flex items-center justify-center shadow-inner">
                <FileText className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-medium text-slate-800 mb-3">
                議事録がありません
              </h3>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                新しい議事録を作成して、会議の内容を記録しましょう。
              </p>
              <Button
                onClick={() => router.push('/meeting-minutes/create')}
                className="px-6 py-5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-md hover:shadow-lg"
              >
                <Plus className="h-5 w-5 mr-2" />
                新規会議議事録を作成
              </Button>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4 pb-6"
            >
              {filteredMeetingMinutes.map((m) => (
                <motion.div
                  key={m.id}
                  variants={itemVariants}
                  whileHover={{
                    y: -3,
                    scale: 1.01,
                    transition: { duration: 0.2 },
                  }}
                  onClick={() => router.push(`/meeting-minutes/${m.id}`)}
                >
                  <Card className="overflow-hidden bg-white/90 border-slate-100/80 rounded-xl p-0.5 shadow-sm hover:shadow-md transition">
                    <div className="p-5 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-violet-400 rounded-full" />

                      <div className="pl-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center text-sm text-slate-500">
                            <Calendar className="h-4 w-4 mr-2 text-indigo-500" />
                            {format(new Date(m.meeting_date), 'yyyy年MM月dd日', {
                              locale: ja,
                            })}
                          </div>
                          <div className="flex gap-2">
                            {m.is_transcribed && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center px-2.5 py-1 rounded-lg"
                              >
                                <Mic className="h-3 w-3 mr-1" />
                                録音済
                              </Badge>
                            )}
                            {m.meeting_types && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-slate-50 text-slate-600 border-slate-200 px-2.5 py-1 rounded-lg"
                              >
                                {m.meeting_types.name}
                              </Badge>
                            )}
                            {(m as any).access_level && (m as any).access_level !== 'all' && (
                              <Badge
                                variant="outline"
                                className={`text-xs flex items-center px-2.5 py-1 rounded-lg ${
                                  (m as any).access_level === 'admin_only' 
                                    ? 'bg-red-50 text-red-600 border-red-200'
                                    : 'bg-blue-50 text-blue-600 border-blue-200'
                                }`}
                              >
                                {(m as any).access_level === 'admin_only' ? (
                                  <>
                                    <Lock className="h-3 w-3 mr-1" />
                                    管理者限定
                                  </>
                                ) : (
                                  <>
                                    <Shield className="h-3 w-3 mr-1" />
                                    主任以上
                                  </>
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="text-base font-medium text-slate-800 pr-4">
                              {m.title}
                            </h3>
                            <div className="flex items-center gap-3 mt-1.5">
                              <div className="flex items-center text-xs text-slate-500">
                                <UserCircle className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
                                <span className="font-medium">
                                  {(m as any).recorded_by_profile?.name ||
                                   m.recorded_by_name ||
                                   (m.creator_info && JSON.parse(m.creator_info).name) ||
                                   '記録者不明'}
                                </span>
                              </div>
                              {m.attendees && m.attendees.length > 0 && (
                                <div className="flex items-center text-xs text-slate-500">
                                  <Users className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                  <span>{m.attendees.length}名参加</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center">
                            {m.audio_file_path && (
                              <div className="mr-2">
                                {m.is_transcribed ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-green-50 text-green-600 border-green-100 flex items-center px-2 py-0.5 rounded-lg"
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    <span className="text-xs">完了</span>
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-50 text-amber-600 border-amber-100 flex items-center px-2 py-0.5 rounded-lg"
                                  >
                                    <ButtonSpinner className="h-3 w-3 mr-1" />
                                    <span className="text-xs">処理中</span>
                                  </Badge>
                                )}
                              </div>
                            )}

                            {canDeleteMeetingMinute(m) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e: MouseEvent) => {
                                  e.stopPropagation();
                                  setDeletingMinuteId(m.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="h-8 w-8 rounded-full mr-2 text-slate-400 hover:text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}

                            <ChevronRight className="h-5 w-5 text-indigo-400" />
                          </div>
                        </div>

                        {/* 処理状況表示 */}
                        {m.processing_status === 'processing' && (
                          <div className="mt-2.5 flex items-center space-x-2">
                            <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
                            <span className="text-sm text-blue-600">文字起こし・要約を処理中...</span>
                          </div>
                        )}

                        {/* 要約表示 */}
                        {m.summary && (
                          <div className="mt-2.5">
                            <div className="text-xs text-blue-600 font-medium mb-1">📝 要約</div>
                            <p className="text-sm text-slate-600 line-clamp-2">
                              {m.summary}
                            </p>
                          </div>
                        )}

                        {/* 文字起こしのみ（要約なし）の場合はsegmentsを表示 */}
                        {!m.summary && m.is_transcribed && m.segments && Array.isArray(m.segments) && (
                          <div className="mt-2.5">
                            <div className="text-xs text-gray-600 font-medium mb-1">💬 文字起こし</div>
                            <p className="text-sm text-slate-500 line-clamp-2">
                              {m.segments.map((seg: any) => seg.text).filter(Boolean).join(' ').substring(0, 100)}...
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </ScrollArea>
      </div>

      {/* delete dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="bg-white rounded-xl border border-slate-200 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center text-lg font-semibold text-slate-800">
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
              議事録の削除
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              この議事録を削除します。この操作は取り消せません。
              <br />
              本当に削除しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteMeetingMinute}
              disabled={isDeleting}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {isDeleting ? (
                <>
                  <ButtonSpinner className="h-4 w-4 mr-2" />
                  削除中...
                </>
              ) : (
                '削除する'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* chatbot button */}
      <Button
        aria-label="チャットボットを開く"
        onClick={() => setIsChatbotOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition flex items-center justify-center z-40 group"
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-400/30 to-purple-500/30 animate-pulse" />
        <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 opacity-25 blur-md group-hover:opacity-35 animate-pulse" />
        <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-pink-300 to-purple-400 opacity-20 blur-xl group-hover:opacity-30 animate-pulse" />
        <MessageSquare className="h-6 w-6 text-white relative z-10" />
      </Button>

      <MeetingSearchChatbot
        facilityId={currentFacilityId ?? ''}
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
      />

      {/* chatbot global css */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-15px);
          }
        }
      `}</style>
    </div>
  );
}

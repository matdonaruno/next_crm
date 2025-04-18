'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { Mic, Plus, Search, FileText, Calendar, ChevronRight, MessageSquare, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { MeetingMinute, MeetingType } from '@/types/meeting-minutes';
import supabase from '@/lib/supabaseClient';
import dynamic from 'next/dynamic';

// よりモダンでスムーズなアニメーション
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 25,
    },
  },
};

// 洗練された背景エフェクト
const BackgroundElements = () => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
      {/* グラデーションブロブ - より洗練された配色 */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-indigo-200/20 to-purple-200/20 blur-3xl -translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-[700px] h-[700px] rounded-full bg-gradient-to-l from-sky-200/15 to-blue-200/15 blur-3xl translate-x-1/4 translate-y-1/4" />
      <div className="absolute bottom-1/2 left-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-tl from-violet-200/10 to-fuchsia-200/10 blur-3xl -translate-x-1/2 translate-y-1/2" />

      {/* 浮遊パーティクル - より洗練された外観 */}
      {Array.from({ length: 25 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: `${Math.random() * 4 + 1}px`,
            height: `${Math.random() * 4 + 1}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.25 + 0.05,
            boxShadow: "0 0 4px rgba(255, 255, 255, 0.6)",
            animation: `float ${Math.random() * 20 + 15}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}

      {/* 光の線エフェクト - 追加の視覚的魅力 */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10">
        <div className="absolute top-[10%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-300 to-transparent" />
        <div className="absolute top-[35%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-300 to-transparent" />
        <div className="absolute top-[65%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-300 to-transparent" />
        <div className="absolute top-[85%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent" />
      </div>
    </div>
  );
};

// チャットボットを動的にインポート
const MeetingSearchChatbot = dynamic(() => import('@/components/MeetingSearchChatbot'), {
  ssr: false,
  loading: () => null,
});

export default function MeetingMinutesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();

  // 状態管理
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinute[]>([]);
  const [filteredMeetingMinutes, setFilteredMeetingMinutes] = useState<MeetingMinute[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [needsFacilityIdFix, setNeedsFacilityIdFix] = useState(false);
  const [isFixingFacilityId, setIsFixingFacilityId] = useState(false);
  const [currentFacilityId, setCurrentFacilityId] = useState<string | null>(null);

  // ユーザーの施設IDをSupabaseから取得
  const fetchCurrentFacilityId = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase.from('profiles').select('facility_id').eq('id', user.id).single();

      if (error) {
        console.error('施設ID取得エラー:', error);
        return null;
      }

      console.log('現在の施設ID:', data.facility_id);
      setCurrentFacilityId(data.facility_id);
      return data.facility_id;
    } catch (error) {
      console.error('施設ID取得中に例外が発生:', error);
      return null;
    }
  }, [user?.id]);

  // ユーザー変更時に施設IDを更新
  useEffect(() => {
    if (user?.id) {
      fetchCurrentFacilityId();
    } else {
      setCurrentFacilityId(null);
    }
  }, [user?.id, fetchCurrentFacilityId]);

  // 議事録データの取得
  const fetchMeetingMinutes = useCallback(async () => {
    if (!currentFacilityId || !user?.id) {
      console.log('施設IDまたはユーザーIDがありません:', { facilityId: currentFacilityId, userId: user?.id });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    console.log('議事録データの取得を開始します:', { facilityId: currentFacilityId });

    try {
      // 方法1: API経由でデータ取得
      const response = await fetch(`/api/meeting-minutes?facilityId=${currentFacilityId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user.id}`,
        }
      });

      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSONパースエラー:', parseError);
        console.log('受信したレスポンス:', responseText);
        throw new Error('レスポンスのパースに失敗しました');
      }

      if (!response.ok) {
        console.error('APIエラー:', data);
        throw new Error(data.error || '議事録の取得に失敗しました');
      }

      if (data && Array.isArray(data)) {
        console.log('議事録データの取得に成功:', { count: data.length });

        // データが取得できた場合
        if (data.length > 0) {
          setMeetingMinutes(data);
          setFilteredMeetingMinutes(data);
          return;
        }

        // データがない場合はフォールバック処理を試行
        console.log('API経由で取得したデータが0件のため、直接クエリを試みます');
      }

      // 方法2: 直接Supabaseクライアントを使用
      console.log('直接Supabaseクエリを実行します');
      const { data: directData, error: directError } = await supabase
        .from('meeting_minutes')
        .select('*')
        .eq('facility_id', currentFacilityId) // 現在の施設IDを使用
        .order('meeting_date', { ascending: false });

      if (directError) {
        console.error('直接クエリエラー:', directError);
        throw new Error('直接クエリでのデータ取得に失敗しました');
      }

      // 総レコード数を確認して詳細表示
      const { count, error: countError } = await supabase
        .from('meeting_minutes')
        .select('*', { count: 'exact', head: true });

      console.log('データベースの総レコード数:', { count, error: countError });
      console.log('取得したレコードの施設ID:');
      if (directData && directData.length > 0) {
        directData.forEach((record, index) => {
          console.log(`レコード ${index + 1}: facility_id = ${record.facility_id}, 自分の施設ID = ${currentFacilityId}`);
        });

        // 施設IDに関係なくすべてのデータを表示（テスト用）
        console.log('直接クエリで議事録データの取得に成功:', { count: directData.length });
        setMeetingMinutes(directData);
        setFilteredMeetingMinutes(directData);
      } else {
        console.log('直接クエリでもデータが取得できませんでした');

        // データがないか、アクセスできない
        setMeetingMinutes([]);
        setFilteredMeetingMinutes([]);
      }
    } catch (error: any) {
      console.error('議事録取得エラー:', error);
      const errorMessage = error.message || '議事録の取得に失敗しました';

      toast({
        title: 'データ取得エラー',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });

      // エラー時は空の配列を設定
      setMeetingMinutes([]);
      setFilteredMeetingMinutes([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentFacilityId, user?.id, toast]);

  // 会議種類データの取得
  const fetchMeetingTypes = useCallback(async () => {
    if (!currentFacilityId) return;

    try {
      // 会議種類データをAPIから取得
      const response = await fetch(`/api/meeting-minutes/types`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user?.id || ''}`,
        }
      });

      if (!response.ok) throw new Error('会議種類データの取得に失敗しました');

      const data = await response.json();
      setMeetingTypes(data || []);

      console.log('会議種類データを取得しました:', data);
    } catch (error) {
      console.error('会議種類データの取得エラー:', error);
      toast({
        title: 'エラー',
        description: '会議種類データの取得に失敗しました',
        variant: 'destructive',
      });
    }
  }, [currentFacilityId, user?.id, toast]);

  // 初期データ取得
  useEffect(() => {
    if (currentFacilityId) {
      fetchMeetingMinutes();
      fetchMeetingTypes();
    }
  }, [currentFacilityId, fetchMeetingMinutes, fetchMeetingTypes]);

  // 検索フィルタ処理
  useEffect(() => {
    if (meetingMinutes.length === 0) return;

    const filtered = meetingMinutes.filter(minute => {
      const matchesSearch = searchTerm === '' || 
        minute.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (minute.content && minute.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (minute.summary && minute.summary.toLowerCase().includes(searchTerm.toLowerCase()));

      if (activeTab === 'all') return matchesSearch;
      if (activeTab === 'recent') {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - 7);
        return matchesSearch && new Date(minute.meeting_date) >= dateLimit;
      }
      if (activeTab === 'recorded') {
        return matchesSearch && minute.is_transcribed;
      }

      return matchesSearch;
    });

    setFilteredMeetingMinutes(filtered);
  }, [searchTerm, meetingMinutes, activeTab]);

  // 施設IDが不一致のレコードを修正する関数
  const fixFacilityIds = async () => {
    if (!currentFacilityId || !user?.id) return;

    setIsFixingFacilityId(true);

    try {
      // 不一致のレコードを取得
      const { data: wrongRecords, error: findError } = await supabase
        .from('meeting_minutes')
        .select('id, facility_id')
        .neq('facility_id', currentFacilityId);

      if (findError) {
        throw new Error('不一致のレコードの取得に失敗しました');
      }

      if (!wrongRecords || wrongRecords.length === 0) {
        toast({
          title: '修正不要',
          description: '施設IDが一致していないレコードはありません',
          duration: 3000,
        });
        setNeedsFacilityIdFix(false);
        return;
      }

      console.log(`修正対象レコード: ${wrongRecords.length}件`, wrongRecords);

      // 修正処理
      const updates = wrongRecords.map(record => ({
        id: record.id,
        facility_id: currentFacilityId
      }));

      const { error: updateError } = await supabase
        .from('meeting_minutes')
        .upsert(updates);

      if (updateError) {
        throw new Error('レコードの更新に失敗しました');
      }

      toast({
        title: '修正完了',
        description: `${wrongRecords.length}件のレコードの施設IDを修正しました`,
        duration: 3000,
      });

      // データを再取得
      await fetchMeetingMinutes();
      setNeedsFacilityIdFix(false);
    } catch (error: any) {
      console.error('施設ID修正エラー:', error);
      toast({
        title: 'エラー',
        description: error.message || '施設IDの修正に失敗しました',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsFixingFacilityId(false);
    }
  };

  // 施設IDの一致をチェックする処理を追加
  useEffect(() => {
    if (meetingMinutes.length > 0 && currentFacilityId) {
      // 不一致のレコードがあるかチェック
      const hasWrongFacilityId = meetingMinutes.some(minute => minute.facility_id !== currentFacilityId);

      if (hasWrongFacilityId) {
        console.log('施設IDが一致していないレコードがあります');
        setNeedsFacilityIdFix(true);
      } else {
        setNeedsFacilityIdFix(false);
      }
    }
  }, [meetingMinutes, currentFacilityId]);

  // 新規作成ページへ移動
  const handleCreateNew = () => {
    router.push('/meeting-minutes/create');
  };

  // 詳細ページへ移動
  const handleViewDetail = (id: string) => {
    router.push(`/meeting-minutes/${id}`);
  };

  return (
    <div className="flex flex-col min-h-screen h-full bg-slate-50/50 overflow-hidden relative">
      <BackgroundElements />

      {/* ヘッダー - よりモダンなスタイル */}
      <AppHeader
        title="会議議事録"
        icon={<Mic className="h-5 w-5 text-indigo-600" />}
        showBackButton={false}
        className="bg-white/90 backdrop-blur-xl border-b border-slate-100/80 shadow-sm z-20"
      />

      {/* メインコンテンツ - スペーシングと配色を改善 */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 lg:px-8 flex-1 flex flex-col relative z-10 py-4">
        {/* 検索とフィルターセクション - 洗練されたUI */}
        <div className="mb-6 sticky top-[53px] bg-white/90 backdrop-blur-xl z-10 rounded-2xl border border-slate-100/80 shadow-sm p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* 検索バー - 改善されたスタイル */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="議事録を検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/80 rounded-xl border-slate-200 focus-visible:ring-indigo-500 shadow-sm h-11"
              />
            </div>

            {/* 新規作成ボタン - より魅力的なデザイン */}
            <Button
              onClick={handleCreateNew}
              className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:from-indigo-600 hover:to-violet-600 h-11 px-5"
            >
              <Plus className="h-4 w-4 mr-2" />
              新規作成
            </Button>
          </div>

          {/* タブ - より洗練されたデザイン */}
          <div className="mt-4">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-3 bg-slate-100/80 p-1 rounded-xl h-11">
                <TabsTrigger
                  value="all"
                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all duration-200 h-9"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  すべて
                </TabsTrigger>
                <TabsTrigger
                  value="recent"
                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all duration-200 h-9"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  最近
                </TabsTrigger>
                <TabsTrigger
                  value="recorded"
                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all duration-200 h-9"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  録音済
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* 施設ID修正ボタン - より目立つデザイン */}
        {needsFacilityIdFix && (
          <div className="mb-5">
            <Button
              onClick={fixFacilityIds}
              disabled={isFixingFacilityId}
              variant="outline"
              className="w-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-xl shadow-sm h-11"
            >
              {isFixingFacilityId ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-amber-700 border-t-transparent rounded-full" />
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

        {/* 議事録リスト - より洗練されたリストデザイン */}
        <ScrollArea className="flex-1 h-[calc(100vh-250px)] pb-20 relative z-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-3 border-indigo-500 border-t-transparent mb-5"></div>
              <p className="text-slate-500 font-medium">データを読み込み中...</p>
            </div>
          ) : filteredMeetingMinutes.length === 0 ? (
            <div className="text-center py-16 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-sm border border-slate-100">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-50 flex items-center justify-center shadow-inner">
                <FileText className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-medium text-slate-800 mb-3">議事録がありません</h3>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                新しい議事録を作成して、会議の内容を記録しましょう。録音機能を使えば、自動で文字起こしも可能です。
              </p>
              <Button
                onClick={handleCreateNew}
                className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 px-6 py-5 h-auto"
              >
                <Plus className="h-5 w-5 mr-2" />
                新規会議議事録を作成
              </Button>
            </div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 pb-6">
              {filteredMeetingMinutes.map((minute) => (
                <motion.div
                  key={minute.id}
                  variants={itemVariants}
                  whileHover={{ y: -3, scale: 1.01, transition: { duration: 0.2 } }}
                  onClick={() => handleViewDetail(minute.id)}
                >
                  <Card className="overflow-hidden border-slate-100/80 bg-white/90 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer rounded-xl p-0.5">
                    <div className="p-5 relative overflow-hidden">
                      {/* 左側の装飾ライン - 視覚的な魅力を追加 */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-violet-400 rounded-full" />
                      
                      <div className="pl-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center text-sm text-slate-500">
                            <Calendar className="h-4 w-4 mr-2 text-indigo-500" />
                            {format(new Date(minute.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
                          </div>

                          <div className="flex gap-2">
                            {minute.is_transcribed && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-indigo-50 text-indigo-600 border-indigo-100 flex items-center px-2.5 py-1 rounded-lg"
                              >
                                <Mic className="h-3 w-3 mr-1" />
                                録音済
                              </Badge>
                            )}

                            {minute.meeting_types && (
                              <Badge 
                                variant="outline" 
                                className="text-xs bg-slate-50 text-slate-600 border-slate-200 px-2.5 py-1 rounded-lg"
                              >
                                {minute.meeting_types.name}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-slate-800 pr-4 text-base">{minute.title}</h3>
                          <ChevronRight className="h-5 w-5 text-indigo-400 flex-shrink-0 transition-transform group-hover:translate-x-1" />
                        </div>

                        {minute.summary && (
                          <div className="mt-2.5">
                            <p className="text-sm text-slate-500 line-clamp-2">{minute.summary}</p>
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

      {/* チャットボットボタン - より洗練されたデザイン */}
      <Button
        onClick={() => setIsChatbotOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl z-40 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 transition-all duration-300 flex items-center justify-center"
        aria-label="チャットボットを開く"
      >
        <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-75"></div>
        <MessageSquare className="h-6 w-6 text-white" />
      </Button>

      {/* チャットボットコンポーネント */}
      <MeetingSearchChatbot
        facilityId={currentFacilityId || ""}
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
      />

      {/* カスタムCSSアニメーション */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% {
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
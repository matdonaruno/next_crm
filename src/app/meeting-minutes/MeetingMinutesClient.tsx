'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { Mic, Plus, Search, FileText, Calendar, ChevronRight, Sparkles, Heart, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { MeetingMinute, MeetingType } from '@/types/meeting-minutes';
import { supabase } from '@/lib/supabaseClient';
import dynamic from 'next/dynamic';

// モバイルアプリ風のアニメーションバリアント
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.07
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24
    }
  }
};

// 装飾用の浮遊する要素のコンポーネント
const FloatingElements = () => {
  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: `${Math.random() * 15 + 5}px`,
            height: `${Math.random() * 15 + 5}px`,
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.4 + 0.1,
            boxShadow: "0 0 8px rgba(255, 255, 255, 0.6)",
            animation: `float ${Math.random() * 10 + 20}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  )
}

// チャットボットを動的インポート（SSR回避）
const MeetingSearchChatbot = dynamic(() => import('@/components/MeetingSearchChatbot'), {
  ssr: false,
  loading: () => null
});

export default function MeetingMinutesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // チャットボット関連の状態を追加
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

  // Supabaseから直接ユーザーのプロファイル（施設ID）を取得
  const fetchCurrentFacilityId = useCallback(async () => {
    if (!user?.id) return null;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('facility_id')
        .eq('id', user.id)
        .single();
        
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

  // ユーザーが変わったらfacility_idを更新
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
    <div className="flex flex-col min-h-screen h-full bg-gradient-to-br from-pink-50 to-purple-50 overflow-hidden relative">
      <FloatingElements />

      {/* AppHeaderコンポーネントを使用 */}
      <AppHeader 
        title="会議議事録" 
        icon={<Mic className="h-5 w-5 text-pink-400" />}
        showBackButton={false}
      />

      {/* メインコンテンツをレスポンシブなコンテナで包む */}
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 flex-1 flex flex-col">
        {/* 検索バー - ポップなデザイン */}
        <div className="py-3 sticky top-[53px] bg-white/50 backdrop-blur-sm z-10 border-b border-pink-100">
          <div className="relative max-w-md md:max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-pink-400" />
            <Input
              type="text"
              placeholder="議事録を検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/80 backdrop-blur-sm rounded-full border-pink-200 focus:border-purple-400 focus:ring-purple-300 shadow-sm"
            />
          </div>
        </div>

        {/* タブ - ポップなデザイン */}
        <div className="pb-2">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md md:max-w-xl mx-auto">
            <TabsList className="grid grid-cols-3 bg-white/60 backdrop-blur-sm p-1 rounded-full border border-pink-100">
              <TabsTrigger
                value="all"
                className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-400 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
              >
                すべて
              </TabsTrigger>
              <TabsTrigger
                value="recent"
                className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-400 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
              >
                最近
              </TabsTrigger>
              <TabsTrigger
                value="recorded"
                className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-400 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all duration-300"
              >
                録音済
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* 新規作成ボタン - リストの上に配置 */}
        <div className="py-2 flex justify-center mb-2">
          <Button 
            onClick={handleCreateNew}
            className="w-full max-w-md md:max-w-xl bg-gradient-to-r from-pink-300 to-purple-400 text-white rounded-full py-2 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02]"
          >
            <Plus className="h-5 w-5 mr-2" />
            新規会議議事録を作成
          </Button>
        </div>

        {needsFacilityIdFix && (
          <div className="mb-2 flex justify-center">
            <Button
              onClick={fixFacilityIds}
              disabled={isFixingFacilityId}
              className="w-full max-w-md md:max-w-xl bg-gradient-to-r from-amber-400 to-amber-500 text-white rounded-xl py-2 text-sm"
            >
              {isFixingFacilityId ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                  施設ID修正中...
                </>
              ) : (
                <>施設IDが一致していないレコードを修正</>
              )}
            </Button>
          </div>
        )}

        {/* 議事録リスト - 縦積みデザイン */}
        <ScrollArea className="flex-1 h-[calc(100vh-250px)] pb-20 relative z-10">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-400"></div>
            </div>
          ) : filteredMeetingMinutes.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-pink-100 max-w-xl mx-auto">
              <FileText className="h-12 w-12 mx-auto mb-3 text-pink-300" />
              <p className="text-lg font-medium bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
                議事録がありません
              </p>
              <p className="mt-1">新しい議事録を作成してみましょう</p>
              <p className="mt-4 text-sm text-gray-500">
                上部の「新規会議議事録を作成」ボタンをクリックして始めましょう
              </p>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="max-w-xl mx-auto space-y-3 pb-4"
            >
              {filteredMeetingMinutes.map((minute, index) => (
                <motion.div 
                  key={minute.id}
                  variants={itemVariants}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleViewDetail(minute.id)}
                  style={{
                    marginTop: index > 0 ? '-8px' : '0',
                    zIndex: filteredMeetingMinutes.length - index,
                    position: 'relative'
                  }}
                >
                  <Card className="p-4 cursor-pointer hover:bg-white/80 transition-all duration-300 overflow-hidden rounded-xl border border-pink-100 bg-white/90 backdrop-blur-sm shadow-md hover:shadow-lg transform hover:-translate-y-1">
                    <div className="mb-2">
                      <div className="flex items-center text-sm font-medium text-purple-600 mb-1">
                        <Calendar className="h-4 w-4 mr-1" />
                        {format(new Date(minute.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-base text-gray-700 pr-5">{minute.title}</h3>
                      <ChevronRight className="h-5 w-5 text-pink-400 flex-shrink-0" />
                    </div>
                    
                    <div className="flex flex-wrap gap-y-1 mb-3">
                      {minute.is_transcribed && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-pink-50 text-pink-500 border-pink-200 flex items-center mr-2"
                        >
                          <Mic className="h-3 w-3 mr-1" />
                          録音済
                        </Badge>
                      )}
                      
                      {minute.meeting_types && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-purple-50 text-purple-500 border-purple-200"
                        >
                          {minute.meeting_types.name}
                        </Badge>
                      )}
                    </div>
                    
                    {minute.summary && (
                      <p className="text-sm text-slate-600 line-clamp-2">{minute.summary}</p>
                    )}
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </ScrollArea>
      </div>

      {/* チャットボット開閉ボタン */}
      <Button
        onClick={() => setIsChatbotOpen(true)}
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-40 bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600"
      >
        <MessageSquare className="h-6 w-6 text-white" />
      </Button>

      {/* チャットボットコンポーネント */}
      <MeetingSearchChatbot
        facilityId={currentFacilityId || ""}
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
      />

      {/* 装飾要素 - 右下 */}
      <div className="absolute bottom-4 right-4 pointer-events-none z-0 opacity-30">
        <Sparkles className="h-16 w-16 text-purple-300" />
      </div>
    </div>
  );
} 
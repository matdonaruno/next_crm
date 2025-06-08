'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Send, X, Loader2, MessageSquare, Sparkles, Filter, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSupabase } from '@/app/_providers/supabase-provider';
import { useAuthContext } from '@/contexts/AuthContext';
import { SearchResult } from '@/types/meeting-minutes';

// ハイライト機能のためのコンポーネント
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  if (!query.trim()) return <span>{text}</span>;
  
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <span>
      {parts.map((part, index) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 text-yellow-900 rounded px-1">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: SearchResult[];
  query?: string; // 検索クエリを保存
}

interface MeetingSearchChatbotProps {
  facilityId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function MeetingSearchChatbot({ facilityId, isOpen, onClose }: MeetingSearchChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'こんにちは！会議議事録について質問してください。例えば「先週の会議の内容は？」や「○○に関する議事録を探して」など、単語単位でも質問できます。質問や検索キーワードを入力してください。'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ start?: string; end?: string }>({});
  const [typeFilter, setTypeFilter] = useState<string>('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { session } = useSupabase();
  const { user } = useAuthContext();
  const router = useRouter();

  // 検索履歴をローカルストレージから読み込み
  useEffect(() => {
    const saved = localStorage.getItem('meeting-search-history');
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.warn('検索履歴の読み込みに失敗:', e);
      }
    }
  }, []);

  // チャットボット表示時に入力欄にフォーカス
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  // 新しいメッセージが追加されたら最下部にスクロール
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const searchMeetingMinutes = async (query: string) => {
    if (!user?.id) {
      toast({
        title: 'エラー',
        description: '認証が必要です。再ログインしてください。',
        variant: 'destructive',
      });
      return [];
    }

    if (!facilityId) {
      toast({
        title: 'エラー',
        description: '施設情報が取得できません。ユーザープロファイルを確認してください。',
        variant: 'destructive',
      });
      return [];
    }

    setIsSearching(true);

    try {
      const response = await fetch('/api/meeting-minutes/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`, // セッショントークンを使用
        },
        body: JSON.stringify({
          query,
          facilityId,
          startDate: dateFilter.start,
          endDate: dateFilter.end,
          meetingType: typeFilter,
        }),
        credentials: 'include', // クッキーも含める
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '検索中にエラーが発生しました');
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('検索エラー:', error);
      toast({
        title: '検索エラー',
        description: error instanceof Error ? error.message : '検索中にエラーが発生しました',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isSearching) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');

    // AIの応答メッセージを一時的に追加（ローディング表示）
    setMessages(prevMessages => [
      ...prevMessages,
      { role: 'assistant', content: '検索中...', results: [] }
    ]);

    // 検索履歴に追加
    const newHistory = [userMessage.content, ...searchHistory.filter(h => h !== userMessage.content)].slice(0, 10);
    setSearchHistory(newHistory);
    localStorage.setItem('meeting-search-history', JSON.stringify(newHistory));

    // 検索実行
    const searchResults = await searchMeetingMinutes(userMessage.content);

    // 検索結果に基づいて応答を更新
    setMessages(prevMessages => {
      const newMessages = [...prevMessages];
      
      // 最後のメッセージ（ローディング表示）を実際の応答に置き換え
      if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
        if (searchResults.length > 0) {
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: `「${userMessage.content}」に関連する議事録が${searchResults.length}件見つかりました：`,
            results: searchResults,
            query: userMessage.content,
          };
        } else {
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: `「${userMessage.content}」に関連する議事録は見つかりませんでした。\n\n他のキーワードで試すか、以下をお試しください：\n- もっと一般的な言葉を使う\n- 異なる表現で検索する\n- 会議のタイトルや日付で検索する`,
          };
        }
      }
      
      return newMessages;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME入力中（変換中）の場合は送信しない
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleViewDetail = (id: string) => {
    router.push(`/meeting-minutes/${id}`);
    onClose();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputText(suggestion);
    setShowSuggestions(false);
    setTimeout(() => handleSendMessage(), 100);
  };

  const filteredSuggestions = searchHistory
    .filter(h => h.toLowerCase().includes(inputText.toLowerCase()) && h !== inputText)
    .slice(0, 5);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-4 w-full max-w-md z-50"
        >
          <Card className="border border-pink-100 shadow-lg rounded-2xl overflow-hidden bg-white/90 backdrop-blur-sm">
            {/* ヘッダー */}
            <div className="p-3 border-b border-pink-100 bg-gradient-to-r from-pink-100 to-purple-100 flex justify-between items-center">
              <div className="flex items-center">
                <MessageSquare className="h-5 w-5 text-pink-500 mr-2" />
                <h3 className="font-medium text-gray-800">会議検索アシスタント</h3>
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-8 w-8 rounded-full hover:bg-pink-200/50"
                >
                  <Filter className="h-4 w-4 text-gray-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 rounded-full hover:bg-pink-200/50"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </Button>
              </div>
            </div>

            {/* フィルタパネル */}
            {showFilters && (
              <div className="p-3 border-b border-pink-100 bg-pink-50/50">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">期間指定</span>
                  </div>
                  <div className="flex space-x-2">
                    <Input
                      type="date"
                      value={dateFilter.start || ''}
                      onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                      className="text-xs"
                      placeholder="開始日"
                    />
                    <Input
                      type="date"
                      value={dateFilter.end || ''}
                      onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                      className="text-xs"
                      placeholder="終了日"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateFilter({});
                        setTypeFilter('');
                      }}
                      className="text-xs"
                    >
                      フィルタクリア
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* メッセージエリア */}
            <ScrollArea className="h-[400px] p-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-pink-100 to-purple-100 text-gray-700 border border-pink-200'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                      {/* 検索結果の表示 */}
                      {message.results && message.results.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.results.map((result) => (
                            <div
                              key={result.id}
                              onClick={() => handleViewDetail(result.id)}
                              className="cursor-pointer bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow border border-gray-200"
                            >
                              <div className="text-xs text-pink-500 font-medium">
                                {format(new Date(result.meeting_date), 'yyyy年MM月dd日', { locale: ja })}
                              </div>
                              <div className="font-medium text-sm text-gray-800">
                                <HighlightedText text={result.title} query={message.query || ''} />
                              </div>
                              <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                                <HighlightedText text={result.snippet} query={message.query || ''} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={endOfMessagesRef} />
              </div>
            </ScrollArea>

            {/* 入力エリア */}
            <div className="p-3 border-t border-pink-100 bg-white">
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Input
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      setShowSuggestions(e.target.value.length > 0 && filteredSuggestions.length > 0);
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(inputText.length > 0 && filteredSuggestions.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="質問を入力..."
                    disabled={isSearching}
                    className="pr-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-full"
                  />
                  <Sparkles className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-pink-400 opacity-70" />
                  
                  {/* 検索履歴サジェスト */}
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                      {filteredSuggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                        >
                          <HighlightedText text={suggestion} query={inputText} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isSearching}
                  size="icon"
                  className="rounded-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 
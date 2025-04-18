'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Send, Search, X, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { SearchResult } from '@/types/meeting-minutes';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: SearchResult[];
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
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

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

    console.log('会議議事録を検索します:', { query, facilityId });
    setIsSearching(true);

    try {
      const response = await fetch('/api/meeting-minutes/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.id}`,
        },
        body: JSON.stringify({
          query,
          facilityId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '検索中にエラーが発生しました');
      }

      const data = await response.json();
      console.log('検索結果:', data.results?.length || 0, '件');
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
            content: '以下の議事録が見つかりました：',
            results: searchResults,
          };
        } else {
          newMessages[newMessages.length - 1] = {
            role: 'assistant',
            content: 'お探しの内容に関連する議事録は見つかりませんでした。別のキーワードで試してみてください。',
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
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full hover:bg-pink-200/50"
              >
                <X className="h-4 w-4 text-gray-600" />
              </Button>
            </div>

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
                          ? 'bg-gradient-to-r from-pink-400 to-purple-500 text-white'
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
                                {result.meeting_type && ` · ${result.meeting_type}`}
                              </div>
                              <div className="font-medium text-sm text-gray-800">{result.title}</div>
                              <div className="text-xs text-gray-600 mt-1 line-clamp-2">{result.snippet}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                関連度: {Math.round(result.relevance * 100)}%
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
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="質問を入力..."
                    disabled={isSearching}
                    className="pr-10 border-pink-200 focus:border-purple-400 focus:ring-purple-300 rounded-full"
                  />
                  <Sparkles className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-pink-400 opacity-70" />
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
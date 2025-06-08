'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useSupabase } from '@/components/SupabaseProvider';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  content?: string;
  message?: string; // 互換性のため
  is_read?: boolean; // 互換性のため
  read?: boolean;
  created_at: string;
  metadata?: any;
  notification_type?: string; // 互換性のため
  related_data?: any; // 互換性のため
}


// テーブル名を定数化（DB構造に合わせて変更可能）
const NOTIFICATIONS_TABLE = 'user_notifications';

export default function UserNotifications() {
  const { user } = useAuth();
  const supabase = useSupabase();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 未読通知の数を計算
  const unreadCount = notifications.filter(n => !(n.read ?? !n.is_read)).length;

  // 通知読み込み処理
  const fetchNotifications = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const normalized = (data || []).map(item => ({
        ...item,
        content: item.content ?? item.message,
        read: item.read ?? !item.is_read,
      }));

      setNotifications(normalized);
    } catch (err) {
      console.error('通知取得エラー:', err);
      setError('通知の取得中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 最初のロード時と認証状態変更時に通知取得
  useEffect(() => {
    fetchNotifications();
    
    // 通知をリアルタイム購読
    if (user) {
      try {
        const channel = supabase
          .channel('notifications')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: NOTIFICATIONS_TABLE,
            filter: `user_id=eq.${user.id}`,
          }, (payload) => {
            // 新しい通知が来たら先頭に追加
            const newItem = payload.new as Notification;
            setNotifications(prev => [
              {
                ...newItem,
                content: newItem.content ?? newItem.message,
                read: newItem.read ?? !newItem.is_read
              }, 
              ...prev
            ]);
          })
          .subscribe();
          
        return () => {
          channel.unsubscribe();
        };
      } catch (err) {
        console.error('通知購読エラー:', err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  // 通知をすべて既読にするハンドラー
  const handleMarkAllAsRead = async () => {
    if (!user || notifications.length === 0) return;
    
    try {
      // データベースのカラム名に合わせて更新
      const updateField = 'is_read'; // または 'read' (DBスキーマに合わせて調整)
      
      const { error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({ [updateField]: true })
        .eq('user_id', user.id)
        .eq(updateField, false);
        
      if (error) {
        console.error('通知既読化エラー:', error);
        return;
      }
      
      // UI上で更新
      setNotifications(notifications.map(n => ({ ...n, read: true, is_read: true })));
    } catch (err) {
      console.error('通知処理エラー:', err);
    }
  };

  // 通知をクリックしたときのハンドラー
  const handleClick = async (n: Notification) => {
    if (n.read || n.is_read) return;
    
    try {
      // データベースのカラム名に合わせて更新
      const updateField = 'is_read'; // または 'read' (DBスキーマに合わせて調整)
      
      const { error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({ [updateField]: true })
        .eq('id', n.id);
        
      if (error) {
        console.error('通知既読化エラー:', error);
        return;
      }
      
      // UI上で更新 
      setNotifications(
        notifications.map(x => 
          x.id === n.id ? { ...x, read: true, is_read: true } : x
        )
      );
    } catch (err) {
      console.error('通知処理エラー:', err);
    }
  };

  // 未ログイン時は表示しない
  if (!user) {
    return null;
  }

  return (
    <TooltipProvider>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-6 w-6" />
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="center"
            className="bg-primary border-primary px-2 py-1 rounded-md text-sm shadow-md whitespace-nowrap tooltip-content"
            style={{ backgroundColor: '#8167a9', color: 'white', border: '1px solid #8167a9' }}
          >
            <p style={{ color: 'white' }}>通知</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" className="w-80 p-0 max-h-96 overflow-auto">
          <div className="p-3 border-b flex justify-between items-center">
            <h3 className="font-medium">通知</h3>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleMarkAllAsRead}
                className="text-xs h-7 px-2"
              >
                すべて既読にする
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="p-6 text-center">
              <LoadingSpinner message="読み込み中..." />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-500">
              <p>{error}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              通知はありません
            </div>
          ) : (
            <div>
              {notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={`p-3 border-b cursor-pointer ${n.read || n.is_read ? 'bg-white' : 'bg-blue-50'}`} 
                  onClick={() => handleClick(n)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium">{n.title}</h4>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(n.created_at), { 
                        addSuffix: true,
                        locale: ja 
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{n.content}</p>
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
} 
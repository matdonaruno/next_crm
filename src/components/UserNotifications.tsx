'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  notification_type: string;
  related_data?: any;
  created_at: string;
}

export default function UserNotifications() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // 通知を取得
  useEffect(() => {
    async function fetchNotifications() {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('通知取得エラー:', error);
        return;
      }

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
      setLoading(false);
    }

    fetchNotifications();

    // リアルタイム更新をリッスン
    const channel = supabase
      .channel('user_notifications_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // 通知を既読にする
  const markAsRead = async (notificationId: string) => {
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('通知既読エラー:', error);
      return;
    }

    // 通知リストを更新
    setNotifications(
      notifications.map(notification =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );

    // 未読カウントを更新
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // すべての通知を既読にする
  const markAllAsRead = async () => {
    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .in(
        'id',
        notifications.filter(n => !n.is_read).map(n => n.id)
      );

    if (error) {
      console.error('全通知既読エラー:', error);
      return;
    }

    // 通知リストを更新
    setNotifications(
      notifications.map(notification => ({ ...notification, is_read: true }))
    );

    // 未読カウントをリセット
    setUnreadCount(0);
  };

  // 日付フォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 通知タイプに応じたアイコン/カラーを取得
  const getNotificationStyles = (type: string) => {
    switch (type) {
      case 'user_registration':
        return { color: 'text-green-500', bgColor: 'bg-green-50' };
      case 'error':
        return { color: 'text-red-500', bgColor: 'bg-red-50' };
      case 'warning':
        return { color: 'text-orange-500', bgColor: 'bg-orange-50' };
      default:
        return { color: 'text-blue-500', bgColor: 'bg-blue-50' };
    }
  };

  return (
    <div className="relative">
      {/* 通知アイコン */}
      <Button
        variant="ghost"
        size="sm"
        className="relative p-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* 通知パネル */}
      {isOpen && (
        <Card className="absolute right-0 mt-2 w-80 shadow-lg z-50">
          <CardContent className="p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">通知</h3>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  すべて既読
                </Button>
              )}
            </div>

            {loading ? (
              <p className="text-center py-4 text-sm text-gray-500">読み込み中...</p>
            ) : notifications.length === 0 ? (
              <p className="text-center py-4 text-sm text-gray-500">
                通知はありません
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {notifications.map(notification => {
                  const styles = getNotificationStyles(notification.notification_type);
                  return (
                    <div
                      key={notification.id}
                      className={`p-2 rounded-md border ${
                        notification.is_read ? 'border-gray-200' : 'border-blue-300'
                      } ${!notification.is_read ? styles.bgColor : ''}`}
                    >
                      <div className="flex justify-between">
                        <h4 className={`font-medium ${styles.color}`}>
                          {notification.title}
                        </h4>
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => markAsRead(notification.id)}
                          >
                            ✓
                          </Button>
                        )}
                      </div>
                      <p className="text-sm">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(notification.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-2 text-center">
              <Link href="/notifications" className="text-blue-500 text-sm hover:underline">
                すべての通知を見る
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 
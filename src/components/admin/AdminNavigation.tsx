'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Settings, Activity, Link, Shield } from 'lucide-react';

export default function AdminNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    {
      path: '/admin/sensors',
      label: 'センサーデバイス管理',
      icon: Settings,
      description: 'デバイスの登録・編集・削除'
    },
    {
      path: '/admin/sensor-mappings',
      label: 'センサーマッピング',
      icon: Link,
      description: 'デバイスと温度管理アイテムの紐づけ'
    },
    {
      path: '/admin/sensor-monitor',
      label: 'センサーモニタリング',
      icon: Activity,
      description: 'リアルタイム状態監視とデータ表示'
    }
  ];

  return (
    <Card className="mb-4 border-gray-200 bg-white shadow-sm">
      <CardContent className="py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            
            // ページごとの色を明示的に設定
            let buttonClass = "flex items-center gap-2 ";
            let iconClass = "h-4 w-4 ";
            
            if (isActive) {
              switch (item.path) {
                case '/admin/sensors':
                  buttonClass += 'bg-gradient-to-r from-pink-400 to-pink-500 text-white border-pink-400';
                  iconClass += 'text-white';
                  break;
                case '/admin/sensor-mappings':
                  buttonClass += 'bg-gradient-to-r from-purple-400 to-purple-500 text-white border-purple-400';
                  iconClass += 'text-white';
                  break;
                case '/admin/sensor-monitor':
                  buttonClass += 'bg-gradient-to-r from-blue-400 to-blue-500 text-white border-blue-400';
                  iconClass += 'text-white';
                  break;
              }
            } else {
              switch (item.path) {
                case '/admin/sensors':
                  buttonClass += 'border-pink-200 text-gray-700 hover:bg-pink-50';
                  iconClass += 'text-pink-600';
                  break;
                case '/admin/sensor-mappings':
                  buttonClass += 'border-purple-200 text-gray-700 hover:bg-purple-50';
                  iconClass += 'text-purple-600';
                  break;
                case '/admin/sensor-monitor':
                  buttonClass += 'border-blue-200 text-gray-700 hover:bg-blue-50';
                  iconClass += 'text-blue-600';
                  break;
              }
            }
            
            return (
              <Button
                key={item.path}
                onClick={() => router.push(item.path)}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={buttonClass}
              >
                <Icon className={iconClass} />
                <span className="text-sm font-medium">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
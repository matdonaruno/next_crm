import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Clock } from 'lucide-react';
import { HistoryEntry } from './types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Props {
  history: HistoryEntry[];
}

export default function HistoryPanel({ history }: Props) {
  return (
    <TableRow className="bg-gray-50">
      <TableCell colSpan={7} className="p-0">
        <div className="p-3 text-sm">
          <h4 className="font-medium text-xs mb-2 text-gray-700">本日の入力履歴</h4>
          <div className="space-y-2">
            {history.map((entry, idx) => (
              <div key={idx} className="border-l-2 border-primary pl-3 py-1">
                <div className="flex items-center text-xs text-gray-600 mb-1">
                  <Clock className="h-3 w-3 mr-1" />
                  <span>{format(new Date(entry.timestamp), 'HH:mm', { locale: ja })}</span>
                  <span className="mx-2">|</span>
                  <span className="font-medium">{entry.timing_name}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                  <span>時間: {entry.implementation_time}</span>
                  <span>サンプル数: {entry.implementation_count}</span>
                  <span>エラー: {entry.error_count}</span>
                  <span>シフト/トレンド: {entry.shift_trend ? 'あり' : 'なし'}</span>
                  {entry.remarks && <span>備考: {entry.remarks}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

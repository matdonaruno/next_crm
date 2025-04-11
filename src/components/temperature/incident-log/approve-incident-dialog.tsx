'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';

interface ApproveIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incidentId: string;
  userId: string;
  initialData?: {
    incident_date: string;
    detected_temperature: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    response_taken: string;
  };
  onSuccess?: () => void;
}

export function ApproveIncidentDialog({
  open,
  onOpenChange,
  incidentId,
  userId,
  initialData,
  onSuccess
}: ApproveIncidentDialogProps) {
  const { toast } = useToast();
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const handleApprove = async () => {
    await handleApprovalAction('approved');
  };
  
  const handleReject = async () => {
    await handleApprovalAction('rejected');
  };
  
  const handleApprovalAction = async (status: 'approved' | 'rejected') => {
    if (!incidentId) return;
    
    setSubmitting(true);
    
    try {
      const updateData = {
        approval_status: status,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approval_comment: approvalComment || null
      };
      
      console.log(`インシデント${status === 'approved' ? '承認' : '却下'}データ:`, updateData);
      
      const { error } = await supabase
        .from('temperature_incident_logs')
        .update(updateData)
        .eq('id', incidentId);
        
      if (error) throw error;
      
      toast({
        title: status === 'approved' ? "承認完了" : "却下完了",
        description: status === 'approved' 
          ? "温度異常対応記録が承認されました。" 
          : "温度異常対応記録が却下されました。",
      });
      
      onOpenChange(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('承認処理エラー:', error);
      toast({
        title: "エラー",
        description: "承認処理中にエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };
  
  // 重要度に応じたスタイルを取得
  const getSeverityInfo = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { label: '重大', class: 'bg-red-100 text-red-800' };
      case 'high':
        return { label: '高', class: 'bg-orange-100 text-orange-800' };
      case 'medium':
        return { label: '中', class: 'bg-yellow-100 text-yellow-800' };
      case 'low':
      default:
        return { label: '低', class: 'bg-blue-100 text-blue-800' };
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-primary">温度異常対応記録の承認</DialogTitle>
          <DialogDescription>
            この温度異常対応記録を確認し、承認または却下してください。
          </DialogDescription>
        </DialogHeader>
        
        {initialData && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="flex justify-between mb-2">
                <div>
                  <p className="text-gray-500 text-sm">発生日時</p>
                  <p className="font-medium">{format(new Date(initialData.incident_date), 'yyyy年MM月dd日 HH:mm', { locale: ja })}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">重要度</p>
                  <Badge className={getSeverityInfo(initialData.severity).class}>
                    {getSeverityInfo(initialData.severity).label}
                  </Badge>
                </div>
              </div>
              
              <div className="mb-2">
                <p className="text-gray-500 text-sm">検知温度</p>
                <p className="font-medium">{initialData.detected_temperature}°C</p>
              </div>
              
              <div>
                <p className="text-gray-500 text-sm">対応内容</p>
                <p className="text-sm mt-1 text-gray-700">{initialData.response_taken}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="approval-comment">
                承認コメント
                <span className="text-gray-500 text-xs ml-1">(任意)</span>
              </Label>
              <Textarea
                id="approval-comment"
                placeholder="承認または却下の理由を入力してください..."
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
        )}
        
        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex space-x-2 w-full sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={submitting}
              className="gap-1"
            >
              <XCircle className="h-4 w-4" />
              却下
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleApprove}
              disabled={submitting}
              className="gap-1"
            >
              <CheckCircle className="h-4 w-4" />
              承認
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 
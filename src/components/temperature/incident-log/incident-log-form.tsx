'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CalendarIcon, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';
import supabase from '@/lib/supabaseClient';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';

interface IncidentLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facilityId: string;
  departmentId: string;
  departmentName: string;
  userId: string;
  userRole?: string;
  prefilledData?: {
    detectedTemperature?: number;
    thresholdMin?: number;
    thresholdMax?: number;
    detectionMethod?: 'sensor' | 'manual' | 'notification';
  };
  editMode?: boolean;
  incidentId?: string;
  onSuccess?: () => void;
}

export function IncidentLogForm({
  open,
  onOpenChange,
  facilityId,
  departmentId,
  departmentName,
  userId,
  userRole = 'regular_user',
  prefilledData,
  editMode = false,
  incidentId,
  onSuccess
}: IncidentLogFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = ['superuser', 'facility_admin', 'approver'].includes(userRole);
  
  // フォームの状態管理
  const [incidentDate, setIncidentDate] = useState<Date>(new Date());
  const [detectedTemperature, setDetectedTemperature] = useState<string>(
    prefilledData?.detectedTemperature?.toString() || ''
  );
  const [thresholdMin, setThresholdMin] = useState<string>(
    prefilledData?.thresholdMin?.toString() || ''
  );
  const [thresholdMax, setThresholdMax] = useState<string>(
    prefilledData?.thresholdMax?.toString() || ''
  );
  const [detectionMethod, setDetectionMethod] = useState<string>(
    prefilledData?.detectionMethod || 'sensor'
  );
  const [severity, setSeverity] = useState<string>('medium');
  const [responseTaken, setResponseTaken] = useState<string>('');
  const [responseResult, setResponseResult] = useState<string>('');
  const [isResolved, setIsResolved] = useState<boolean>(false);
  
  // 承認関連の状態
  const [approvalStatus, setApprovalStatus] = useState<string>('pending');
  const [approvalComment, setApprovalComment] = useState<string>('');
  
  // 日付選択用のポップオーバー制御
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // 編集モードの場合にデータを取得
  useEffect(() => {
    if (editMode && incidentId && open) {
      const fetchIncidentData = async () => {
        try {
          const { data, error } = await supabase
            .from('temperature_incident_logs')
            .select('*')
            .eq('id', incidentId)
            .single();
            
          if (error) throw error;
          
          if (data) {
            // フォームデータを設定
            setIncidentDate(new Date(data.incident_date));
            setDetectedTemperature(data.detected_temperature.toString());
            setThresholdMin(data.threshold_min.toString());
            setThresholdMax(data.threshold_max.toString());
            setDetectionMethod(data.detection_method);
            setSeverity(data.severity);
            setResponseTaken(data.response_taken || '');
            setResponseResult(data.response_result || '');
            setIsResolved(!!data.resolved_at);
            
            // 承認関連データの設定
            setApprovalStatus(data.approval_status || 'pending');
            setApprovalComment(data.approval_comment || '');
          }
        } catch (error) {
          console.error('インシデントデータ取得エラー:', error);
          toast({
            title: "データ取得エラー",
            description: "インシデントデータの取得に失敗しました。",
            variant: "destructive",
          });
        }
      };
      
      fetchIncidentData();
    }
  }, [editMode, incidentId, open, toast]);
  
  // フォームの送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      // バリデーション
      if (!detectedTemperature || !thresholdMin || !thresholdMax || !responseTaken) {
        toast({
          title: "入力エラー",
          description: "必須項目をすべて入力してください。",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      
      // 温度は数値に変換
      const tempDetected = parseFloat(detectedTemperature);
      const tempMin = parseFloat(thresholdMin);
      const tempMax = parseFloat(thresholdMax);
      
      if (isNaN(tempDetected) || isNaN(tempMin) || isNaN(tempMax)) {
        toast({
          title: "入力エラー",
          description: "温度は有効な数値で入力してください。",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      
      // インシデントログデータの作成
      const incidentLogData: any = {
        facility_id: facilityId,
        department_id: departmentId,
        incident_date: incidentDate.toISOString(),
        detected_temperature: tempDetected,
        threshold_min: tempMin,
        threshold_max: tempMax,
        detection_method: detectionMethod,
        severity: severity,
        response_taken: responseTaken,
        response_result: responseResult || null,
        resolved_at: isResolved ? new Date().toISOString() : null,
        resolved_by: isResolved ? userId : null
      };
      
      // 管理者が承認情報を更新する場合
      if (isAdmin) {
        // 既存の承認ステータスが変更された場合のみ承認情報を更新
        if (approvalStatus !== 'pending') {
          incidentLogData.approval_status = approvalStatus;
          incidentLogData.approved_by = userId;
          incidentLogData.approved_at = new Date().toISOString();
          incidentLogData.approval_comment = approvalComment || null;
        }
      }
      
      console.log('提出するインシデントログデータ:', incidentLogData);
      
      // Supabaseにデータを挿入または更新
      let data, error;
      
      if (editMode && incidentId) {
        // 更新モード
        ({ data, error } = await supabase
          .from('temperature_incident_logs')
          .update(incidentLogData)
          .eq('id', incidentId)
          .select());
      } else {
        // 新規作成モード
        incidentLogData.created_by = userId;
        incidentLogData.created_at = new Date().toISOString();
        
        ({ data, error } = await supabase
          .from('temperature_incident_logs')
          .insert(incidentLogData)
          .select());
      }
        
      if (error) {
        console.error('インシデントログ保存エラー:', error);
        throw error;
      }
      
      console.log('保存されたデータ:', data);
      
      // 成功メッセージ
      toast({
        title: editMode ? "更新完了" : "保存完了",
        description: editMode 
          ? "温度異常対応記録が更新されました。" 
          : "温度異常対応記録が保存されました。",
      });
      
      // フォームをリセットしてダイアログを閉じる
      resetForm();
      onOpenChange(false);
      
      // 成功コールバック
      if (onSuccess) {
        onSuccess();
      }
      
    } catch (error) {
      console.error('フォーム送信エラー:', error);
      toast({
        title: "エラー",
        description: "データの保存中にエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };
  
  // フォームのリセット
  const resetForm = () => {
    setIncidentDate(new Date());
    setDetectedTemperature(prefilledData?.detectedTemperature?.toString() || '');
    setThresholdMin(prefilledData?.thresholdMin?.toString() || '');
    setThresholdMax(prefilledData?.thresholdMax?.toString() || '');
    setDetectionMethod(prefilledData?.detectionMethod || 'sensor');
    setSeverity('medium');
    setResponseTaken('');
    setResponseResult('');
    setIsResolved(false);
    setApprovalStatus('pending');
    setApprovalComment('');
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-primary">
            {editMode ? '温度異常対応記録の編集' : '温度異常対応記録'}
          </DialogTitle>
          <DialogDescription>
            {departmentName}での温度異常とその対応を記録します。
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="incident-date">発生日時</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !incidentDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {incidentDate ? format(incidentDate, 'yyyy年MM月dd日 HH:mm', { locale: ja }) : "日付を選択"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={incidentDate}
                  onSelect={(date) => {
                    if (date) {
                      const currentDate = new Date(incidentDate);
                      date.setHours(currentDate.getHours());
                      date.setMinutes(currentDate.getMinutes());
                      setIncidentDate(date);
                      setDatePickerOpen(false);
                    }
                  }}
                  initialFocus
                />
                <div className="p-3 border-t border-gray-100">
                  <div className="flex space-x-2">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      placeholder="時"
                      className="w-20"
                      value={incidentDate.getHours()}
                      onChange={(e) => {
                        const newDate = new Date(incidentDate);
                        newDate.setHours(parseInt(e.target.value) || 0);
                        setIncidentDate(newDate);
                      }}
                    />
                    <span className="flex items-center">:</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="分"
                      className="w-20"
                      value={incidentDate.getMinutes()}
                      onChange={(e) => {
                        const newDate = new Date(incidentDate);
                        newDate.setMinutes(parseInt(e.target.value) || 0);
                        setIncidentDate(newDate);
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="detected-temperature">検知温度 (°C)</Label>
              <Input
                id="detected-temperature"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={detectedTemperature}
                onChange={(e) => setDetectedTemperature(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold-min">下限温度 (°C)</Label>
              <Input
                id="threshold-min"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={thresholdMin}
                onChange={(e) => setThresholdMin(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold-max">上限温度 (°C)</Label>
              <Input
                id="threshold-max"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={thresholdMax}
                onChange={(e) => setThresholdMax(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>検知方法</Label>
            <RadioGroup
              value={detectionMethod}
              onValueChange={setDetectionMethod}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="sensor" id="method-sensor" />
                <Label htmlFor="method-sensor">センサー</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="manual" id="method-manual" />
                <Label htmlFor="method-manual">手動確認</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="notification" id="method-notification" />
                <Label htmlFor="method-notification">通知</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="space-y-2">
            <Label>重要度</Label>
            <RadioGroup
              value={severity}
              onValueChange={setSeverity}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="low" id="severity-low" />
                <Label htmlFor="severity-low">低</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="medium" id="severity-medium" />
                <Label htmlFor="severity-medium">中</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="high" id="severity-high" />
                <Label htmlFor="severity-high">高</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="critical" id="severity-critical" />
                <Label htmlFor="severity-critical">重大</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="response-taken">対応内容</Label>
            <Textarea
              id="response-taken"
              placeholder="どのような対応を行ったか記入してください..."
              value={responseTaken}
              onChange={(e) => setResponseTaken(e.target.value)}
              className="min-h-[80px]"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="response-result">対応結果</Label>
            <Textarea
              id="response-result"
              placeholder="対応の結果を記入してください..."
              value={responseResult}
              onChange={(e) => setResponseResult(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="is-resolved"
              checked={isResolved}
              onCheckedChange={setIsResolved}
            />
            <Label htmlFor="is-resolved">解決済みとしてマーク</Label>
          </div>
          
          {/* 管理者向け承認セクション */}
          {isAdmin && (
            <>
              <Separator className="my-4" />
              
              <div className="bg-gray-50 p-3 rounded-md">
                <h3 className="font-medium text-gray-700 mb-2">管理者承認セクション</h3>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="approval-status">承認ステータス</Label>
                    <Select
                      value={approvalStatus}
                      onValueChange={setApprovalStatus}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="承認ステータスを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">保留中</SelectItem>
                        <SelectItem value="approved">承認</SelectItem>
                        <SelectItem value="rejected">却下</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="approval-comment">承認コメント</Label>
                    <Textarea
                      id="approval-comment"
                      placeholder="承認または却下の理由を入力してください..."
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting ? "保存中..." : (editMode ? "更新" : "保存")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 
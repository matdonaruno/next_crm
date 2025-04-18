'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import supabase from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  RefreshCw,
  ClipboardCheck,
  Pencil,
  XCircle,
  Filter,
} from 'lucide-react';
import { IncidentLogForm } from './incident-log-form';
import { ApproveIncidentDialog } from './approve-incident-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface TemperatureIncidentLog {
  id: string;
  facility_id: string;
  department_id: string;
  incident_date: string;
  detected_temperature: number;
  threshold_min: number;
  threshold_max: number;
  detection_method: 'sensor' | 'manual' | 'notification';
  severity: 'low' | 'medium' | 'high' | 'critical';
  response_taken: string;
  response_result: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  created_by: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  approval_comment: string | null;
  responder_name?: string;
  approver_name?: string;
}

interface IncidentListProps {
  facilityId: string;
  departmentId: string;
  departmentName: string;
  userId: string;
  userRole?: string;
}

export function IncidentList({
  facilityId,
  departmentId,
  departmentName,
  userId,
  userRole = 'regular_user',
}: IncidentListProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [incidentLogs, setIncidentLogs] = useState<TemperatureIncidentLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<TemperatureIncidentLog | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const isAdmin = ['superuser', 'facility_admin', 'approver'].includes(userRole);
  
  // インシデントログデータの取得
  const fetchIncidentLogs = async () => {
    setLoading(true);
    
    try {
      let query = supabase
        .from('temperature_incident_logs')
        .select('*')
        .eq('facility_id', facilityId)
        .eq('department_id', departmentId)
        .order('incident_date', { ascending: false });
        
      // ステータスフィルタの適用
      if (filterStatus !== 'all') {
        query = query.eq('approval_status', filterStatus);
      }
      
      // クエリを実行
      const { data, error } = await query.limit(20);
        
      if (error) {
        console.error('インシデントログ取得エラー:', error);
        throw error;
      }
      
      console.log('取得したインシデントログ:', data);
      
      // ユーザー情報の追加
      const logsWithUserInfo = await Promise.all(
        (data || []).map(async (log) => {
          let responderName = undefined;
          let approverName = undefined;
          
          // 解決者の名前を取得
          if (log.resolved_by) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('fullname')
              .eq('id', log.resolved_by)
              .single();
              
            if (profileData) {
              responderName = profileData.fullname;
            }
          }
          
          // 承認者の名前を取得
          if (log.approved_by) {
            const { data: approverData } = await supabase
              .from('profiles')
              .select('fullname')
              .eq('id', log.approved_by)
              .single();
              
            if (approverData) {
              approverName = approverData.fullname;
            }
          }
          
          return {
            ...log,
            responder_name: responderName,
            approver_name: approverName
          };
        })
      );
      
      setIncidentLogs(logsWithUserInfo);
    } catch (error) {
      console.error('インシデントログ読み込みエラー:', error);
      toast({
        title: "データ取得エラー",
        description: "温度異常記録の取得に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 初回読み込み
  useEffect(() => {
    if (facilityId && departmentId) {
      fetchIncidentLogs();
    }
  }, [facilityId, departmentId, filterStatus]);
  
  // インシデント編集ハンドラー
  const handleEditIncident = (incident: TemperatureIncidentLog) => {
    setSelectedIncident(incident);
    setEditMode(true);
    setFormOpen(true);
  };
  
  // インシデント承認ハンドラー
  const handleApproveIncident = (incident: TemperatureIncidentLog) => {
    setSelectedIncident(incident);
    setApproveDialogOpen(true);
  };
  
  // 重要度に応じたラベルとスタイルを取得
  const getSeverityInfo = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          label: '重大',
          bgColor: 'bg-red-100',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          bgContainer: 'bg-red-50'
        };
      case 'high':
        return {
          label: '高',
          bgColor: 'bg-orange-100',
          textColor: 'text-orange-700',
          borderColor: 'border-orange-200',
          bgContainer: 'bg-orange-50'
        };
      case 'medium':
        return {
          label: '中',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          bgContainer: 'bg-yellow-50'
        };
      case 'low':
      default:
        return {
          label: '低',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          bgContainer: 'bg-blue-50'
        };
    }
  };
  
  // 承認ステータスに応じたバッジを取得
  const getApprovalStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            承認済
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            却下
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <Clock className="h-3 w-3 mr-1" />
            保留中
          </Badge>
        );
    }
  };
  
  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div 
          className="flex justify-between items-center mb-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3 className="text-lg font-semibold flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-red-500" />
            温度異常対応履歴
          </h3>
          <div className="flex items-center">
            <Button 
              variant="outline" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditMode(false);
                setSelectedIncident(null);
                setFormOpen(true);
              }}
            >
              新規対応記録
              <PlusCircle className="h-4 w-4 ml-1" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <Filter className="h-4 w-4 mr-2 text-gray-500" />
                <Label className="mr-2 text-sm text-gray-700">フィルタ:</Label>
                <Select 
                  value={filterStatus} 
                  onValueChange={setFilterStatus}
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue placeholder="すべて" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="pending">保留中</SelectItem>
                    <SelectItem value="approved">承認済</SelectItem>
                    <SelectItem value="rejected">却下</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchIncidentLogs();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                更新
              </Button>
            </div>
            
            <div className="space-y-3">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : incidentLogs.length === 0 ? (
                <div className="text-gray-500 italic p-4 text-center border border-dashed rounded-lg">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-gray-400" />
                  {filterStatus === 'all' 
                    ? '記録された温度異常はありません' 
                    : `${filterStatus === 'pending' ? '保留中' : filterStatus === 'approved' ? '承認済み' : '却下された'}温度異常記録はありません`}
                </div>
              ) : (
                incidentLogs.map((log) => {
                  const severityInfo = getSeverityInfo(log.severity);
                  return (
                    <div 
                      key={log.id}
                      className={`
                        p-3 rounded-lg border ${severityInfo.borderColor} ${severityInfo.bgContainer}
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center">
                            <p className="font-medium">
                              {format(parseISO(log.incident_date), 'yyyy年MM月dd日 HH:mm', { locale: ja })}
                            </p>
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${severityInfo.bgColor} ${severityInfo.textColor}`}>
                              {severityInfo.label}
                            </span>
                            <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                              {log.detection_method === 'sensor' && 'センサー'}
                              {log.detection_method === 'manual' && '手動確認'}
                              {log.detection_method === 'notification' && '通知'}
                            </span>
                            <div className="ml-2">
                              {getApprovalStatusBadge(log.approval_status)}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            検知温度: <span className={`font-medium ${severityInfo.textColor}`}>{log.detected_temperature}°C</span>
                            {' '}(正常範囲: {log.threshold_min}°C 〜 {log.threshold_max}°C)
                          </p>
                          
                          <div className="mt-2">
                            <p className="text-sm font-medium text-gray-700">対応内容:</p>
                            <p className="text-sm text-gray-600 mt-1">{log.response_taken}</p>
                          </div>
                          
                          {log.response_result && (
                            <div className="mt-2">
                              <p className="text-sm font-medium text-gray-700">対応結果:</p>
                              <p className="text-sm text-gray-600 mt-1">{log.response_result}</p>
                            </div>
                          )}
                          
                          {log.approval_comment && (
                            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                              <p className="text-sm font-medium text-gray-700">承認コメント:</p>
                              <p className="text-sm text-gray-600 mt-1">{log.approval_comment}</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end">
                          <div className="flex items-center mb-2">
                            {log.resolved_at ? (
                              <div className="flex items-center text-green-600 text-sm mr-2">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span className="font-medium">解決済</span>
                              </div>
                            ) : (
                              <div className="flex items-center text-orange-600 text-sm mr-2">
                                <Clock className="h-4 w-4 mr-1" />
                                <span className="font-medium">対応中</span>
                              </div>
                            )}
                            
                            <TooltipProvider>
                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                          <circle cx="12" cy="12" r="1" />
                                          <circle cx="12" cy="5" r="1" />
                                          <circle cx="12" cy="19" r="1" />
                                        </svg>
                                      </Button>
                                    </DropdownMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>アクション</p>
                                  </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="end">
                                  {/* 編集オプション - 保留中のみ編集可能 */}
                                  {(log.approval_status === 'pending' || userRole === 'superuser') && (
                                    <DropdownMenuItem onClick={() => handleEditIncident(log)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      編集
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {/* 承認オプション - 管理者のみ承認可能 */}
                                  {isAdmin && log.approval_status === 'pending' && (
                                    <DropdownMenuItem onClick={() => handleApproveIncident(log)}>
                                      <ClipboardCheck className="h-4 w-4 mr-2" />
                                      承認処理
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TooltipProvider>
                          </div>
                          
                          {log.responder_name && (
                            <p className="text-xs text-gray-500">
                              対応者: {log.responder_name}
                            </p>
                          )}
                          
                          {log.approver_name && log.approval_status !== 'pending' && (
                            <p className="text-xs text-gray-500 mt-1">
                              {log.approval_status === 'approved' ? '承認者' : '却下者'}: {log.approver_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              
              {incidentLogs.length > 0 && incidentLogs.length >= 20 && (
                <div className="pt-2 text-center">
                  <Button
                    variant="link"
                    className="text-sm text-gray-500"
                    onClick={() => {
                      toast({
                        title: "準備中",
                        description: "すべての記録表示機能は現在開発中です。",
                      });
                    }}
                  >
                    すべての記録を表示
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      {/* インシデントログフォーム */}
      <IncidentLogForm
        open={formOpen}
        onOpenChange={setFormOpen}
        facilityId={facilityId}
        departmentId={departmentId}
        departmentName={departmentName}
        userId={userId}
        userRole={userRole}
        editMode={editMode}
        incidentId={selectedIncident?.id}
        prefilledData={
          selectedIncident ? {
            detectedTemperature: selectedIncident.detected_temperature,
            thresholdMin: selectedIncident.threshold_min,
            thresholdMax: selectedIncident.threshold_max,
            detectionMethod: selectedIncident.detection_method as any,
          } : undefined
        }
        onSuccess={fetchIncidentLogs}
      />
      
      {/* 承認ダイアログ */}
      <ApproveIncidentDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        incidentId={selectedIncident?.id || ''}
        userId={userId}
        initialData={
          selectedIncident ? {
            incident_date: selectedIncident.incident_date,
            detected_temperature: selectedIncident.detected_temperature,
            severity: selectedIncident.severity,
            response_taken: selectedIncident.response_taken,
          } : undefined
        }
        onSuccess={fetchIncidentLogs}
      />
    </>
  );
} 
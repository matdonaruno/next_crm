export interface Department {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  facility_id?: string;
}

export interface Equipment {
  pm_equipment_id: number;
  equipment_name: string;
  department_id: string;
  model_number?: string;
  serial_number?: string;
  installation_date?: string;
  maintenance_interval?: number;
  is_active: boolean;
}

export interface ImplementationTiming {
  timing_id: number;
  timing_name: string;
}

export interface PrecisionManagementRecord {
  record_id: number;
  department_id: string;
  pm_equipment_id: number;
  implementation_date: string; // ISO形式の日付文字列
  implementation_time?: string; // 実施時間（HH:MM形式）
  implementer: string;
  timing_id: number;
  implementation_count: number;
  error_count: number;
  shift_trend: boolean;
  remarks: string | null;
  created_at?: string; // ISO形式の日付文字列
  updated_at?: string; // ISO形式の日付文字列
}

// APIレスポンス用の拡張インターフェース
export interface PrecisionManagementRecordWithDetails extends PrecisionManagementRecord {
  department_name: string;
  equipment_name: string;
  timing_name: string;
}

// 通知に関する型定義
export interface MissingRecord {
  department_id: string;
  department_name: string;
  equipment_id: number;
  equipment_name: string;
  date: string;
}

export interface NotificationResponse {
  date: string;
  missing_records: MissingRecord[];
  total_missing: number;
}

export interface SlackNotificationBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
      emoji?: boolean;
    };
    url?: string;
  }>;
} 
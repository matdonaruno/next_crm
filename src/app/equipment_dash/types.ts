/* -------------------------------------------------------------
 *  Equipment Dashboard ─ 共通型定義
 * ----------------------------------------------------------- */

// プロファイル型定義
export interface Profile {
  id: string;
  fullname: string;
  email: string;
  facility_id: string;
  department_id: string | null;
  role: string;
  facilities?: { id: string; name: string }[] | null;
  departments?: { id: string; name: string }[] | null;
}

export interface Equipment {
  id: string;
  name: string;
  description: string | null;
  facility_id: string;
  department_id: string;
  created_at: string | null;
  updated_at: string | null;
  /** 紐づく部署は一つのみ */
  department?: { name: string } | null;
  department_name?: string;
  checkItems?: EquipmentCheckItem[];
  pendingChecks?: number;
}
  
  export interface EquipmentCheckItem {
    id: string;
    equipment_id: string;
    name: string;
    description: string | null;
    frequency: 'daily' | 'weekly' | 'monthly' | 'as_needed';
    created_at: string;
    updated_at: string;
    lastCheckDate?: string | null;
    lastCheckResult?: boolean | null;
    isOverdue?: boolean;
    isPeriodCompleted?: boolean;
  }
  
  export interface MaintenanceRecord {
    id: string;
    check_item_id: string;
    equipment_id: string;
    performed_by: string;
    performed_at: string;
    result: boolean;
    comment: string | null;
    created_at: string;
    performer_name?: string;
    check_item_name?: string;
    equipment_name?: string;
    verified_by?: string | null;
    verified_at?: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
    status?: string;
    verifier_name?: string;
    approver_name?: string;
  }
  
  export interface ModalCheckItemData extends EquipmentCheckItem {
    submitResult: boolean;
    submitComment: string | null;
  }
  
  /* テーブル表示用 */
  export interface TableCellData {
    result: boolean | null;
    recordId?: string;
    comment?: string | null;
  }
  
  export interface TableRowData {
    type: 'equipment' | 'frequency' | 'item';
    id: string;
    equipmentName?: string;
    itemName?: string;
    frequency?: string;
    cells: Record<string, TableCellData>;
  }
  
  /* 画面モード */
  export type ViewMode = 'equipment' | 'frequency' | 'table';
  
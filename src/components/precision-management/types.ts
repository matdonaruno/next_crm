export interface Equipment {
    pm_equipment_id: number;
    equipment_name: string;
  }
  
  export interface ImplementationTiming {
    timing_id: number;
    timing_name: string;
  }
  
  export interface HistoryEntry {
    timestamp: string;
    timing_name: string;
    implementation_count: number;
    error_count: number;
    shift_trend: boolean;
    remarks: string | null;
    implementation_time: string;
  }
  
  export interface RecordInput {
    timing_id: number | null;
    implementation_count: number;
    error_count: number;
    shift_trend: boolean;
    remarks: string;
    implementation_time: string;
  }
  
  export interface RecordCardType {
    equipment: Equipment;
    data: RecordInput;
    history: HistoryEntry[];
  }
  
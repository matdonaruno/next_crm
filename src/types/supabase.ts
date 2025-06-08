export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      departments: {
        Row: {
          created_at: string | null
          facility_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          facility_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          facility_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          created_at: string | null
          department_id: string
          description: string | null
          facility_id: string
          id: string
          model_id: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          description?: string | null
          facility_id: string
          id?: string
          model_id?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          description?: string | null
          facility_id?: string
          id?: string
          model_id?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_check_items: {
        Row: {
          created_at: string | null
          description: string | null
          equipment_id: string
          frequency: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          equipment_id: string
          frequency: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          equipment_id?: string
          frequency?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_check_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance_records: {
        Row: {
          check_item_id: string
          comment: string | null
          created_at: string | null
          equipment_id: string
          id: string
          performed_at: string
          performed_by: string
          result: boolean
        }
        Insert: {
          check_item_id: string
          comment?: string | null
          created_at?: string | null
          equipment_id: string
          id?: string
          performed_at?: string
          performed_by: string
          result: boolean
        }
        Update: {
          check_item_id?: string
          comment?: string | null
          created_at?: string | null
          equipment_id?: string
          id?: string
          performed_at?: string
          performed_by?: string
          result?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_records_check_item_id_fkey"
            columns: ["check_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_check_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_records_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_records_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_records_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "equipment_maintenance_records_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      equipment_models: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          manufacturer: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          manufacturer?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      facilities: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      facility_notifications: {
        Row: {
          config: Json
          created_at: string
          facility_id: string
          id: string
          notification_channel: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          facility_id: string
          id?: string
          notification_channel: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          facility_id?: string
          id?: string
          notification_channel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_notifications_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_timings: {
        Row: {
          timing_id: number
          timing_name: string
        }
        Insert: {
          timing_id?: number
          timing_name: string
        }
        Update: {
          timing_id?: number
          timing_name?: string
        }
        Relationships: []
      }
      meeting_minutes: {
        Row: {
          attendees: string[] | null
          audio_file_path: string | null
          content: string | null
          created_at: string | null
          department_id: string | null
          facility_id: string | null
          id: string
          is_transcribed: boolean | null
          keywords: string[] | null
          meeting_date: string
          meeting_type_id: string | null
          processing_status:
            | Database["public"]["Enums"]["processing_enum"]
            | null
          recorded_by: string | null
          segments: Json | null
          speakers: Json | null
          summary: string | null
          title: string
          transcript: string | null
          updated_at: string | null
        }
        Insert: {
          attendees?: string[] | null
          audio_file_path?: string | null
          content?: string | null
          created_at?: string | null
          department_id?: string | null
          facility_id?: string | null
          id?: string
          is_transcribed?: boolean | null
          keywords?: string[] | null
          meeting_date: string
          meeting_type_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_enum"]
            | null
          recorded_by?: string | null
          segments?: Json | null
          speakers?: Json | null
          summary?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
        }
        Update: {
          attendees?: string[] | null
          audio_file_path?: string | null
          content?: string | null
          created_at?: string | null
          department_id?: string | null
          facility_id?: string | null
          id?: string
          is_transcribed?: boolean | null
          keywords?: string[] | null
          meeting_date?: string
          meeting_type_id?: string | null
          processing_status?:
            | Database["public"]["Enums"]["processing_enum"]
            | null
          recorded_by?: string | null
          segments?: Json | null
          speakers?: Json | null
          summary?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_minutes_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_minutes_meeting_type_id_fkey"
            columns: ["meeting_type_id"]
            isOneToOne: false
            referencedRelation: "meeting_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_minutes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_minutes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "meeting_minutes_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      meeting_types: {
        Row: {
          created_at: string | null
          description: string | null
          facility_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          facility_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          facility_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_types_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_temperature_verifications: {
        Row: {
          comments: string | null
          created_at: string
          department_id: string
          facility_id: string
          has_anomalies: boolean
          id: string
          updated_at: string | null
          verified_at: string
          verified_by: string | null
          year_month: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          department_id: string
          facility_id: string
          has_anomalies?: boolean
          id?: string
          updated_at?: string | null
          verified_at: string
          verified_by?: string | null
          year_month: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          department_id?: string
          facility_id?: string
          has_anomalies?: boolean
          id?: string
          updated_at?: string | null
          verified_at?: string
          verified_by?: string | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_temperature_verifications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_temperature_verifications_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_temperature_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_temperature_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "monthly_temperature_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          created_at: string
          error_message: string | null
          facility_id: string | null
          id: string
          notification_type: string
          payload: Json | null
          sent_at: string
          status: string
          user_notification_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          facility_id?: string | null
          id?: string
          notification_type: string
          payload?: Json | null
          sent_at?: string
          status: string
          user_notification_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          facility_id?: string | null
          id?: string
          notification_type?: string
          payload?: Json | null
          sent_at?: string
          status?: string
          user_notification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_user_notification_id_fkey"
            columns: ["user_notification_id"]
            isOneToOne: false
            referencedRelation: "user_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      precision_management_equipments: {
        Row: {
          department_id: string
          equipment_name: string
          installation_date: string | null
          is_active: boolean | null
          maintenance_interval: number | null
          model_number: string | null
          pm_equipment_id: number
          serial_number: string | null
        }
        Insert: {
          department_id: string
          equipment_name: string
          installation_date?: string | null
          is_active?: boolean | null
          maintenance_interval?: number | null
          model_number?: string | null
          pm_equipment_id?: number
          serial_number?: string | null
        }
        Update: {
          department_id?: string
          equipment_name?: string
          installation_date?: string | null
          is_active?: boolean | null
          maintenance_interval?: number | null
          model_number?: string | null
          pm_equipment_id?: number
          serial_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precision_management_equipments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      precision_management_records: {
        Row: {
          created_at: string | null
          department_id: string
          error_count: number
          implementation_count: number
          implementation_date: string
          implementation_time: string | null
          implementer: string
          pm_equipment_id: number
          record_id: number
          remarks: string | null
          shift_trend: boolean
          timing_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          error_count: number
          implementation_count: number
          implementation_date: string
          implementation_time?: string | null
          implementer: string
          pm_equipment_id: number
          record_id?: number
          remarks?: string | null
          shift_trend?: boolean
          timing_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          error_count?: number
          implementation_count?: number
          implementation_date?: string
          implementation_time?: string | null
          implementer?: string
          pm_equipment_id?: number
          record_id?: number
          remarks?: string | null
          shift_trend?: boolean
          timing_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precision_management_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precision_management_records_pm_equipment_id_fkey"
            columns: ["pm_equipment_id"]
            isOneToOne: false
            referencedRelation: "precision_management_equipments"
            referencedColumns: ["pm_equipment_id"]
          },
          {
            foreignKeyName: "precision_management_records_timing_id_fkey"
            columns: ["timing_id"]
            isOneToOne: false
            referencedRelation: "implementation_timings"
            referencedColumns: ["timing_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          facility_id: string | null
          fullname: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          facility_id?: string | null
          fullname?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          facility_id?: string | null
          fullname?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      reagent_items: {
        Row: {
          created_at: string | null
          ended_at: string | null
          ended_by: string | null
          facility_id: string | null
          id: number
          name: string
          reagent_package_id: number
          updated_at: string | null
          usagestartdate: string | null
          used: boolean
          user: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          facility_id?: string | null
          id?: number
          name: string
          reagent_package_id: number
          updated_at?: string | null
          usagestartdate?: string | null
          used?: boolean
          user?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          facility_id?: string | null
          id?: number
          name?: string
          reagent_package_id?: number
          updated_at?: string | null
          usagestartdate?: string | null
          used?: boolean
          user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reagent_items_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_items_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "reagent_items_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "reagent_items_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_items_reagent_package_id_fkey"
            columns: ["reagent_package_id"]
            isOneToOne: false
            referencedRelation: "reagents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_items_user_fkey"
            columns: ["user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_items_user_fkey"
            columns: ["user"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "reagent_items_user_fkey"
            columns: ["user"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      reagents: {
        Row: {
          department: string | null
          ended_at: string | null
          ended_by: string | null
          expirationDate: string | null
          facility_id: string | null
          id: number
          jan_code: string | null
          lotNo: string | null
          name: string
          registeredBy: string | null
          registrationDate: string | null
          specification: string | null
          unit: string | null
          updated_at: string | null
          used: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          department?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expirationDate?: string | null
          facility_id?: string | null
          id?: number
          jan_code?: string | null
          lotNo?: string | null
          name: string
          registeredBy?: string | null
          registrationDate?: string | null
          specification?: string | null
          unit?: string | null
          updated_at?: string | null
          used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          department?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expirationDate?: string | null
          facility_id?: string | null
          id?: number
          jan_code?: string | null
          lotNo?: string | null
          name?: string
          registeredBy?: string | null
          registrationDate?: string | null
          specification?: string | null
          unit?: string | null
          updated_at?: string | null
          used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reagents_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagents_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "reagents_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "reagents_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagents_registeredby_fkey"
            columns: ["registeredBy"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagents_registeredby_fkey"
            columns: ["registeredBy"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "reagents_registeredby_fkey"
            columns: ["registeredBy"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "reagents_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagents_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "reagents_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      sensor_data: {
        Row: {
          aht_hum: number | null
          aht_temp: number | null
          battery_volt: number | null
          bmp_pres: number | null
          bmp_temp: number | null
          facility_id: string
          updated_at: string
        }
        Insert: {
          aht_hum?: number | null
          aht_temp?: number | null
          battery_volt?: number | null
          bmp_pres?: number | null
          bmp_temp?: number | null
          facility_id: string
          updated_at?: string
        }
        Update: {
          aht_hum?: number | null
          aht_temp?: number | null
          battery_volt?: number | null
          bmp_pres?: number | null
          bmp_temp?: number | null
          facility_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensor_data_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_device_logs: {
        Row: {
          battery_volt: number | null
          device_id: string
          updated_at: string
        }
        Insert: {
          battery_volt?: number | null
          device_id: string
          updated_at?: string
        }
        Update: {
          battery_volt?: number | null
          device_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensor_device_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "sensor_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_devices: {
        Row: {
          auth_token: string | null
          created_at: string | null
          department_id: string | null
          device_id: string | null
          device_name: string
          facility_id: string | null
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_connection: string | null
          last_seen: string | null
          location: string | null
          mac_address: string | null
          status: string | null
        }
        Insert: {
          auth_token?: string | null
          created_at?: string | null
          department_id?: string | null
          device_id?: string | null
          device_name: string
          facility_id?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_connection?: string | null
          last_seen?: string | null
          location?: string | null
          mac_address?: string | null
          status?: string | null
        }
        Update: {
          auth_token?: string | null
          created_at?: string | null
          department_id?: string | null
          device_id?: string | null
          device_name?: string
          facility_id?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_connection?: string | null
          last_seen?: string | null
          location?: string | null
          mac_address?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_devices_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_logs: {
        Row: {
          device_id: string | null
          id: string
          ip_address: string | null
          is_processed: boolean | null
          raw_data: Json | null
          recorded_at: string | null
          sensor_device_id: string | null
        }
        Insert: {
          device_id?: string | null
          id?: string
          ip_address?: string | null
          is_processed?: boolean | null
          raw_data?: Json | null
          recorded_at?: string | null
          sensor_device_id?: string | null
        }
        Update: {
          device_id?: string | null
          id?: string
          ip_address?: string | null
          is_processed?: boolean | null
          raw_data?: Json | null
          recorded_at?: string | null
          sensor_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_logs_sensor_device_id_fkey"
            columns: ["sensor_device_id"]
            isOneToOne: false
            referencedRelation: "sensor_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_mappings: {
        Row: {
          created_at: string | null
          id: string
          offset_value: number | null
          sensor_device_id: string | null
          sensor_type: string
          temperature_item_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          offset_value?: number | null
          sensor_device_id?: string | null
          sensor_type: string
          temperature_item_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          offset_value?: number | null
          sensor_device_id?: string | null
          sensor_type?: string
          temperature_item_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_mappings_sensor_device_id_fkey"
            columns: ["sensor_device_id"]
            isOneToOne: false
            referencedRelation: "sensor_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_mappings_temperature_item_id_fkey"
            columns: ["temperature_item_id"]
            isOneToOne: false
            referencedRelation: "temperature_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          facility_id: string
          id: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          facility_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          facility_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "fk_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_facility"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      temperature_incident_logs: {
        Row: {
          approval_comment: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          department_id: string
          detected_temperature: number
          detection_method: string
          facility_id: string
          id: string
          incident_date: string
          resolved_at: string | null
          resolved_by: string | null
          response_result: string | null
          response_taken: string
          severity: string
          threshold_max: number
          threshold_min: number
        }
        Insert: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id: string
          detected_temperature: number
          detection_method: string
          facility_id: string
          id?: string
          incident_date: string
          resolved_at?: string | null
          resolved_by?: string | null
          response_result?: string | null
          response_taken: string
          severity: string
          threshold_max: number
          threshold_min: number
        }
        Update: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string
          detected_temperature?: number
          detection_method?: string
          facility_id?: string
          id?: string
          incident_date?: string
          resolved_at?: string | null
          resolved_by?: string | null
          response_result?: string | null
          response_taken?: string
          severity?: string
          threshold_max?: number
          threshold_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "temperature_incident_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "temperature_incident_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
        ]
      }
      temperature_items: {
        Row: {
          created_at: string | null
          default_value: number | null
          department_id: string
          display_name: string | null
          display_order: number | null
          facility_id: string
          id: string
          item_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: number | null
          department_id: string
          display_name?: string | null
          display_order?: number | null
          facility_id: string
          id?: string
          item_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: number | null
          department_id?: string
          display_name?: string | null
          display_order?: number | null
          facility_id?: string
          id?: string
          item_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temperature_items_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_items_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      temperature_record_details: {
        Row: {
          created_at: string | null
          data_source: string | null
          id: string
          temperature_item_id: string
          temperature_record_id: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          data_source?: string | null
          id?: string
          temperature_item_id: string
          temperature_record_id: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          data_source?: string | null
          id?: string
          temperature_item_id?: string
          temperature_record_id?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "temperature_record_details_temperature_item_id_fkey"
            columns: ["temperature_item_id"]
            isOneToOne: false
            referencedRelation: "temperature_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_record_details_temperature_record_id_fkey"
            columns: ["temperature_record_id"]
            isOneToOne: false
            referencedRelation: "temperature_records"
            referencedColumns: ["id"]
          },
        ]
      }
      temperature_records: {
        Row: {
          created_at: string | null
          created_by: string | null
          department_id: string
          facility_id: string
          id: string
          is_auto_recorded: boolean | null
          record_date: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department_id: string
          facility_id: string
          id?: string
          is_auto_recorded?: boolean | null
          record_date: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string
          facility_id?: string
          id?: string
          is_auto_recorded?: boolean | null
          record_date?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temperature_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_records_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action_details: Json | null
          action_type: string
          created_at: string | null
          id: string
          performed_by: string
          user_id: string
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          created_at?: string | null
          id?: string
          performed_by: string
          user_id: string
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          created_at?: string | null
          id?: string
          performed_by?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          department_id: string | null
          email: string
          expires_at: string
          facility_id: string
          id: string
          invitation_token: string
          invited_by: string
          is_used: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          department_id?: string | null
          email: string
          expires_at: string
          facility_id: string
          id?: string
          invitation_token: string
          invited_by: string
          is_used?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          department_id?: string | null
          email?: string
          expires_at?: string
          facility_id?: string
          id?: string
          invitation_token?: string
          invited_by?: string
          is_used?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean
          message: string
          notification_type: string
          related_data: Json | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean
          message: string
          notification_type: string
          related_data?: Json | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          related_data?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_temperature_verifications: {
        Row: {
          comments: string | null
          created_at: string | null
          department_id: string
          facility_id: string
          has_anomalies: boolean | null
          id: string
          updated_at: string | null
          verified_at: string
          verified_by: string | null
          week_end_date: string | null
          week_start_date: string
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          department_id: string
          facility_id: string
          has_anomalies?: boolean | null
          id?: string
          updated_at?: string | null
          verified_at: string
          verified_by?: string | null
          week_end_date?: string | null
          week_start_date: string
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          department_id?: string
          facility_id?: string
          has_anomalies?: boolean | null
          id?: string
          updated_at?: string | null
          verified_at?: string
          verified_by?: string | null
          week_end_date?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_temperature_verifications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_temperature_verifications_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      tasks_with_users: {
        Row: {
          assigned_to: string | null
          assigned_user_fullname: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          created_user_fullname: string | null
          created_user_id: string | null
          department_id: string | null
          description: string | null
          facility_id: string | null
          id: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "fk_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "fk_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_facility"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "fk_users"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["assigned_user_id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tasks_with_users"
            referencedColumns: ["created_user_id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_invitation_token: {
        Args: { token_param: string }
        Returns: Json
      }
      convert_sensor_logs_complete: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      convert_sensor_logs_safely: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      convert_sensor_logs_simple: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      convert_sensor_logs_to_temperature_records: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_auto_mappings_for_devices: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_mappings_for_device: {
        Args: { device_name_param: string }
        Returns: string
      }
      debug_conversion_process: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_tables: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      insert_profile_admin: {
        Args:
          | {
              p_id: string
              p_fullname: string
              p_email: string
              p_facility_id: string
              p_department_id: string
              p_role: string
              p_is_active: boolean
            }
          | {
              p_id: string
              p_fullname: string
              p_email: string
              p_facility_id: string
              p_role: string
              p_is_active: boolean
            }
        Returns: boolean
      }
      process_single_log: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
    }
    Enums: {
      processing_enum: "queued" | "processing" | "done" | "error"
      user_role: "superuser" | "facility_admin" | "approver" | "regular_user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      processing_enum: ["queued", "processing", "done", "error"],
      user_role: ["superuser", "facility_admin", "approver", "regular_user"],
    },
  },
} as const

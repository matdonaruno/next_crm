// src/types/meeting-minutes.ts
// ───────────────────────────────────────────────────────────
// Meeting-minutes ドメインに関する共通型を “１か所” に集約
// ───────────────────────────────────────────────────────────
import type { Database } from './supabase';

/* ---------- Supabase 自動生成 Row 型 ---------- */
export type Profile          = Database['public']['Tables']['profiles']['Row'];
export type MeetingTypeRow   = Database['public']['Tables']['meeting_types']['Row'];
export type MeetingMinuteRow = Database['public']['Tables']['meeting_minutes']['Row'];

/* ---------- フォーム入力用 型 ---------- */
export interface MeetingMinuteFormData {
  /** 議事録タイトル（空なら自動生成） */
  title: string;
  /** 会議タイプ ID（任意） */
  meeting_type_id: string | null;
  /** 日時 ISO-8601（例: 2025-05-20T14:00） */
  meeting_date: string;
  /** 参加者カンマ区切り文字列 */
  attendees: string;
}

/**
 * 会議録検索結果用の型
 */
export interface SearchResult {
  /** 議事録ID */
  id: MeetingMinuteRow['id'];
  /** 議事録タイトル */
  title: MeetingMinuteRow['title'];
  /** 会議日時 */
  meeting_date: MeetingMinuteRow['meeting_date'];
  /** 検索結果のスニペット */
  snippet: string;
}
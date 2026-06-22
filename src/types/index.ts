// =====================
// 役割の定義
// =====================
// 当日用役割: '全体会', '受付', 'アテンド', 'PC', '共済', '学び'
// 研修用役割: 'コアメンバー', 'PC', '共済', '学び'
export const DAY_ROLES = [
  '全体会',
  '受付',
  'アテンド',
  'PC',
  '共済',
  '学び',
] as const;

export const TRAINING_ROLES = ['コアメンバー', 'PC', '共済', '学び'] as const;

// 役割は付かないが出勤する人を表す特別ラベル（shift_assignments.role に格納）。
// 実際の役割（DAY_ROLES/TRAINING_ROLES）とは別枠で扱う。
export const NO_ROLE = '役割なし';

export type DayRole = (typeof DAY_ROLES)[number];
export type TrainingRole = (typeof TRAINING_ROLES)[number];

// =====================
// 目安箱（スタッフからの投稿）
// =====================
export const SUGGESTION_CATEGORIES = [
  '商品について',
  '業務について',
  '人間関係について',
  'このアプリについて',
  'その他',
] as const;

export const SUGGESTION_TYPES = ['質問', '意見', '相談', 'その他'] as const;

// コアメンバー判定に使う研修役割ラベル（scope='core' の閲覧可否に使用）。
export const CORE_ROLE = 'コアメンバー';

export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];
// 閲覧範囲: 'all' = 全スタッフ / 'core' = コアメンバーのみ（管理者は常に全件閲覧可）
export type SuggestionScope = 'all' | 'core';
// 'open' = 未対応 / 'done' = 対応済み
export type SuggestionStatus = 'open' | 'done';

export type SlotType = 'day' | 'training';
export type AssignmentStatus = 'open' | 'draft' | 'published';
export type NotificationType =
  | 'shift_reminder'
  | 'role_assigned'
  | 'shift_confirmed'
  | 'custom';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

// =====================
// テーブル行の型（DBスキーマ対応）
// =====================
export interface User {
  id: string;
  name: string;
  password_hash: string;
  line_user_id: string | null;
  day_roles: string[];
  training_roles: string[];
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftSlot {
  id: string;
  slot_type: SlotType;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  deadline: string; // ISO timestamp
  assignment_status: AssignmentStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTargetUser {
  shift_slot_id: string;
  user_id: string;
}

export interface ShiftRoleRequirement {
  id: string;
  shift_slot_id: string;
  role: string;
  required_count: number;
}

export interface ShiftSubmission {
  id: string;
  user_id: string;
  shift_slot_id: string;
  available: boolean;
  note: string | null;
  submitted_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  user_id: string;
  shift_slot_id: string;
  role: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  stock: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface Suggestion {
  id: string;
  user_id: string | null; // 名前非表示でも保存する（画面には出さない）
  category: string;
  type: string;
  show_name: boolean; // true=投稿者名を表示 / false=非表示
  scope: SuggestionScope;
  content: string;
  status: SuggestionStatus;
  created_at: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string | null;
  notification_type: NotificationType;
  message: string;
  status: NotificationStatus;
  sent_at: string;
}

export interface AdminLoginAttempt {
  id: string;
  identifier: string; // 共有パスワード方式のため固定キー or IP
  failed_attempts: number;
  locked_until: string | null;
  updated_at: string;
}

// =====================
// JWT ペイロード
// =====================
export interface UserJwtPayload {
  userId: string;
  name: string;
  iat: number;
  exp: number;
}

export interface AdminJwtPayload {
  role: 'admin';
  iat: number;
  exp: number;
}

// =====================
// API エラーレスポンス（統一フォーマット）
// =====================
export interface ApiError {
  error: string;
  code?: string;
}

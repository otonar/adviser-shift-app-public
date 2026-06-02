import { z } from 'zod';
import { DAY_ROLES, TRAINING_ROLES } from '@/types';

// 全 API Route Handler はここで定義した zod スキーマでバリデーションする。

export const signupSchema = z.object({
  name: z.string().trim().min(2, '名前は2文字以上').max(20, '名前は20文字以内'),
  password: z.string().min(8, 'パスワードは8文字以上'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  name: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// ===== シフト枠 =====

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が不正です');
const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, '時刻の形式が不正です');

export const createShiftSchema = z
  .object({
    slot_type: z.enum(['day', 'training']),
    date: dateStr,
    start_time: timeStr,
    end_time: timeStr,
    note: z.string().max(500).optional(),
    target_user_ids: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => v.start_time < v.end_time, {
    message: '開始時刻は終了時刻より前にしてください',
    path: ['end_time'],
  });
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = z.object({
  date: dateStr.optional(),
  start_time: timeStr.optional(),
  end_time: timeStr.optional(),
  note: z.string().max(500).nullable().optional(),
  role_requirements: z
    .array(
      z.object({
        role: z.string().min(1),
        required_count: z.number().int().min(0),
      })
    )
    .optional(),
});
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const updateTargetsSchema = z.object({
  user_ids: z.array(z.string().uuid()),
});
export type UpdateTargetsInput = z.infer<typeof updateTargetsSchema>;

// ===== 希望提出 =====

export const submissionSchema = z.object({
  available: z.boolean(),
  note: z.string().max(500).optional(),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

// ===== 役割割り振り =====

export const runAssignmentSchema = z.object({
  shift_slot_id: z.string().uuid(),
});
export type RunAssignmentInput = z.infer<typeof runAssignmentSchema>;

export const manualAssignmentSchema = z.object({
  assignments: z.array(
    z.object({
      userId: z.string().uuid(),
      role: z.string().min(1),
    })
  ),
});
export type ManualAssignmentInput = z.infer<typeof manualAssignmentSchema>;

// ===== 商品・在庫 =====

export const createProductSchema = z.object({
  name: z.string().trim().min(1, '商品名は必須です').max(100),
  description: z.string().max(1000).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  stock: z.number().int().min(0, '在庫は0以上').default(0),
  is_visible: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    category: z.string().max(50).nullable().optional(),
    stock: z.number().int().min(0).optional(),
    is_visible: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: '更新項目がありません',
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ===== ユーザー設定（自分） =====

const dayRoleEnum = z.enum(DAY_ROLES);
const trainingRoleEnum = z.enum(TRAINING_ROLES);

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, '名前は2文字以上').max(20, '名前は20文字以内').optional(),
    day_roles: z.array(dayRoleEnum).optional(),
    training_roles: z.array(trainingRoleEnum).optional(),
    // LIFF から取得した LINE userId。null で連携解除。
    line_user_id: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: '更新項目がありません',
  });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// ===== メンバー管理（管理者） =====

export const adminUpdateUserSchema = z.object({
  is_active: z.boolean(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ===== LINE 通知 =====

export const notificationSchema = z.object({
  type: z.enum(['shift_reminder', 'role_assigned', 'shift_confirmed', 'custom']),
  target_user_ids: z.union([z.literal('all'), z.array(z.string().uuid()).min(1)]),
  message: z.string().trim().min(1, 'メッセージは必須です').max(1000),
});
export type NotificationInput = z.infer<typeof notificationSchema>;

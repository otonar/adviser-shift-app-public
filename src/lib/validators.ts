import { z } from 'zod';

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

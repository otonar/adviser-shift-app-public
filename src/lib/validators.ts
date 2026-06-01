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

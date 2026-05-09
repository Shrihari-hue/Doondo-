/**
 * Zod schemas for the auth module. Single source of truth for what a valid
 * request body looks like. Used by validate() middleware AND inferred into
 * TypeScript types so controllers get type-safe req.body.
 */

import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email('Invalid email');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'Password must include letters and numbers',
  });

export const registerSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, 'Name is required').max(120),
      email: emailSchema,
      password: passwordSchema,
      role: z.enum(['seeker', 'employer']),
      phone: z
        .string()
        .trim()
        .regex(/^[+0-9\s-]{6,20}$/, 'Invalid phone number')
        .optional(),
      // Seeker-only: solo applicant or team. Carried from the role
      // picker so the user doesn't have to re-pick after signup.
      workType: z.enum(['solo', 'team']).optional(),
      teamSize: z.number().int().min(2).max(50).optional(),
    })
    .superRefine((body, ctx) => {
      if (body.role !== 'seeker') return;
      if (body.workType === 'team' && (body.teamSize == null || body.teamSize < 2)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teamSize'],
          message: 'Team size is required when applying as a team.',
        });
      }
    }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const logoutSchema = refreshSchema;

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];

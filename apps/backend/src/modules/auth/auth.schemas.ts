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
// Same shape the verification module uses — keep them aligned so a phone
// that signs you up can later receive an OTP without re-validating.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{6,20}$/, 'Enter a valid phone number');

export const registerSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, 'Name is required').max(120),
      email: emailSchema,
      password: passwordSchema,
      role: z.enum(['seeker', 'employer']),
      // Phone is required for new signups so password reset over SMS works
      // for every fresh account. Existing accounts created before this
      // change can still log in without a phone, and the add-phone flow in
      // settings backfills them.
      phone: phoneSchema,
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
    // Optional. Required only when the same email holds BOTH a seeker and
    // an employer account on this server (the "Add Employer" arrow on the
    // seeker profile allows that). Without role, the server returns a
    // 200 envelope with `needsRoleChoice: true` and the available roles
    // so the mobile client can show a picker, then re-submit with `role`.
    role: z.enum(['seeker', 'employer']).optional(),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const logoutSchema = refreshSchema;

// ─── Password reset (Phase 5) ─────────────────────────────────────────────
// Three-step flow, modeled on the verification OTP pattern:
//   1. forgotPassword     → user submits phone, we send an OTP (if a user
//      with that phone exists). We always return success to avoid letting
//      attackers enumerate registered numbers.
//   2. verifyResetCode    → user submits phone + OTP, we mint a short-lived
//      reset token JWT.
//   3. resetPassword      → user submits the reset token + new password,
//      we update the hash, clear the token, and revoke refresh tokens.

export const forgotPasswordSchema = z.object({
  body: z
    .object({
      phone: phoneSchema,
    })
    .strict(),
});

export const verifyResetCodeSchema = z.object({
  body: z
    .object({
      phone: phoneSchema,
      code: z
        .string()
        .trim()
        .regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
    })
    .strict(),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      resetToken: z.string().min(1, 'Reset token is required'),
      newPassword: passwordSchema,
    })
    .strict(),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];

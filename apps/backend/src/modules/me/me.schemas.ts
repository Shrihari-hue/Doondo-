/**
 * Zod schemas for the /me module — seeker profile + location updates.
 *
 * Notably absent: role, email, isVerified, isActive. Those are NOT
 * editable here. Email change goes through a separate verification
 * flow (Phase 5); role is set at signup and immutable; verification
 * status is admin/system controlled.
 */

import { z } from 'zod';
import {
  AVAILABILITIES,
  BUSINESS_TYPES,
  PREFERRED_JOB_TYPES,
  WORK_TYPES,
} from '@/modules/users/user.model';

export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: z
        .string()
        .trim()
        .regex(/^[+0-9\s-]{6,20}$/)
        .nullable()
        .optional(),
      bio: z.string().trim().max(500).nullable().optional(),
      experienceYears: z.number().int().min(0).max(60).nullable().optional(),
      availability: z.enum(AVAILABILITIES).nullable().optional(),
      preferredJobTypes: z.array(z.enum(PREFERRED_JOB_TYPES)).max(5).optional(),
      skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      workType: z.enum(WORK_TYPES).nullable().optional(),
      teamSize: z.number().int().min(2).max(50).nullable().optional(),
      // Base64 data URL — cap raw length so the JSON body stays sane.
      // Mobile is responsible for compressing before send.
      photoUrl: z
        .string()
        .max(360_000)
        .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/i, 'Photo must be a data URL')
        .nullable()
        .optional(),
      // Employer-only fields (Phase 3). Backend doesn't gate by role on
      // input — sending these as a seeker is a no-op since the employer
      // dashboard never reads them.
      companyName: z.string().trim().min(1).max(120).nullable().optional(),
      businessType: z.enum(BUSINESS_TYPES).nullable().optional(),
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
        .nullable()
        .optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      // Cross-field rule: team size is required when workType is "team".
      if (body.workType === 'team' && (body.teamSize == null || body.teamSize < 2)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['teamSize'],
          message: 'Team size is required when applying as a team.',
        });
      }
    }),
});

export const pushTokenSchema = z.object({
  body: z.object({
    token: z
      .string()
      .trim()
      .min(10)
      .max(200)
      .regex(/^ExponentPushToken\[[^\]]+\]$/, 'Invalid Expo push token'),
  }),
});

/**
 * Resume upload — base64 data URL of a PDF or DOCX, plus metadata.
 *
 * Mobile is responsible for capping at ~900KB raw before encoding so the
 * encoded payload stays under the express body limit.
 */
export const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
] as const;

const resumeDataUrl = z
  .string()
  .max(1_300_000)
  .regex(
    /^data:(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword);base64,/i,
    'Resume must be a PDF or DOCX data URL',
  );

export const uploadResumeSchema = z.object({
  body: z
    .object({
      dataUrl: resumeDataUrl,
      filename: z.string().trim().min(1).max(200),
      mimeType: z.enum(RESUME_MIME_TYPES),
      sizeBytes: z.number().int().min(1).max(5_000_000),
    })
    .strict(),
});

export const updateEmployerLocationSchema = z.object({
  body: z
    .object({
      city: z.string().trim().min(1).max(80),
      area: z.string().trim().min(1).max(80).nullable().optional(),
      pincode: z
        .string()
        .trim()
        .regex(/^[0-9]{4,12}$/)
        .nullable()
        .optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .strict(),
});

export const updateLocationSchema = z.object({
  body: z
    .object({
      city: z.string().trim().min(1).max(80),
      area: z.string().trim().min(1).max(80).nullable().optional(),
      pincode: z
        .string()
        .trim()
        .regex(/^[0-9]{4,12}$/)
        .nullable()
        .optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .strict(),
});

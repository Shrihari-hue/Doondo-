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
  SALARY_PERIODS,
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
      /**
       * Desired pay. Pass null to clear. Amount is in minor units (paise
       * for INR) for parity with Job.pay.
       */
      expectedSalary: z
        .object({
          amount: z.number().int().min(0),
          period: z.enum(SALARY_PERIODS),
          currency: z.string().length(3).default('INR'),
        })
        .nullable()
        .optional(),
      // Base64 data URL — cap raw length so the JSON body stays sane.
      // Mobile is responsible for compressing before send.
      photoUrl: z
        .string()
        .max(360_000)
        .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/i, 'Photo must be a data URL')
        .nullable()
        .optional(),
      // Work-sample photos — PUT-style: array on the wire is the array
      // stored. Empty array clears. Per-photo cap mirrors photoUrl plus
      // some slack for slightly less compression-friendly samples.
      workPhotos: z
        .array(
          z
            .string()
            .max(500_000)
            .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/i, 'Each photo must be a data URL'),
        )
        .max(6)
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

/**
 * Resume Builder — PUT-style endpoint: client sends the full work-history
 * array and the server replaces what's stored. Empty array clears the
 * resume. Max 5 entries from the UI; the model permits 10 for headroom.
 *
 * `current === true` is mutually exclusive with `endDate`: we let the
 * client send both shapes and normalise in the controller.
 */
const workExperienceEntrySchema = z
  .object({
    company: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    startDate: z.string().regex(/^\d{4}-\d{2}$/, 'startDate must be YYYY-MM'),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'endDate must be YYYY-MM')
      .nullable()
      .optional(),
    current: z.boolean().default(false),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.current && !v.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate is required unless current is true',
      });
    }
    if (v.endDate && v.startDate > v.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });

export const updateWorkHistorySchema = z.object({
  body: z
    .object({
      entries: z.array(workExperienceEntrySchema).max(5),
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

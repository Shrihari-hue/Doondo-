/**
 * Zod schemas for the Quick Work request endpoints (employer-plan.md §25).
 */

import { z } from 'zod';

const objectId = z.string().uuid('Invalid id');

export const requestIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/** Body shared by create + update-draft — every field optional, since the
 * mobile flow fills this in progressively (Category → Service → Describe
 * → Media → Location → Timing → Budget → Review), per employer-plan.md §9.2. */
export const draftBodySchema = z
  .object({
    categoryId: objectId.nullable().optional(),
    serviceId: objectId.nullable().optional(),
    title: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    photos: z.array(z.string().url().or(z.string().min(1))).max(6).optional(),
    videos: z.array(z.string().url().or(z.string().min(1))).max(2).optional(),
    voiceNoteUrl: z.string().nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    address: z.string().trim().max(240).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    isImmediate: z.boolean().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    budgetMin: z.number().int().min(0).nullable().optional(),
    budgetMax: z.number().int().min(0).nullable().optional(),
  })
  .strict();

export const createDraftSchema = z.object({ body: draftBodySchema });

export const updateDraftSchema = z.object({
  params: z.object({ id: objectId }),
  body: draftBodySchema,
});

export const listMineSchema = z.object({
  query: z
    .object({
      role: z.enum(['employer', 'worker']).optional(),
      status: z.string().optional(),
    })
    .default({}),
});

export const cancelSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      reason: z.string().trim().max(500).nullable().optional(),
    })
    .default({}),
});

export const arrivingSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .default({}),
});

export const completeSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      completionPhotoUrl: z.string().nullable().optional(),
      completionNotes: z.string().trim().max(1000).nullable().optional(),
      finalPrice: z.number().int().min(0).nullable().optional(),
    })
    .default({}),
});

export const disputeSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    reason: z.string().trim().min(3).max(500),
  }),
});

export const reportNoShowSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    reason: z.string().trim().min(3).max(500),
  }),
});

export const uploadMediaSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      kind: z.enum(['photo', 'video', 'voice']),
      dataUrl: z
        .string()
        .min(20)
        .max(1_500_000)
        .regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, 'dataUrl must be a base64 data URL'),
      mimeType: z.string().min(1).max(80),
      fileName: z.string().trim().min(1).max(200).default('attachment'),
    })
    .strict(),
});

export const removeMediaSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      kind: z.enum(['photo', 'video', 'voice']),
      url: z.string().optional(),
    })
    .strict(),
});

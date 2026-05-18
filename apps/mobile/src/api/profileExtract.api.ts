/**
 * One-photo profile — backend extraction endpoint wrapper.
 *
 * The mobile captures or picks a photo, compresses it, and POSTs the
 * data URL. The backend either calls Anthropic's vision API (prod) or
 * returns a mock fixture (dev). Both return the same `ExtractedProfile`
 * shape so the confirmation screen renders identically either way.
 */

import { apiRequest } from './client';
import type { ExtractedProfile } from './types';

export const profileExtractApi = {
  extractFromPhoto: (imageDataUrl: string, locale?: string) =>
    apiRequest<{ extracted: ExtractedProfile }>(
      '/me/profile/extract-from-photo',
      {
        method: 'POST',
        body: { imageDataUrl, ...(locale ? { locale } : {}) },
      },
    ),
};

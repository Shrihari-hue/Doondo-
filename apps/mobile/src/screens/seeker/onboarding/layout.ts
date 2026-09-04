/**
 * Shared seeker layout constants.
 *
 * design/layout.md §1 fixes the screen gutter at 16px and §2 puts section
 * spacing at 24px. The seeker screens had drifted between 16 and 20 over
 * time; everything built or redesigned for the Short Term / Long Term
 * work is pinned to these two constants so the left and right edges line
 * up across Home, onboarding, and the filter sheet.
 */

import { spacing } from '@doondo/tokens';

/** Standard horizontal screen padding — design/layout.md §1. */
export const SEEKER_GUTTER = spacing.lg; // 16

/** Vertical gap between major sections — design/layout.md §2. */
export const SEEKER_SECTION_GAP = spacing['2xl']; // 24

/**
 * Bottom inset for scroll content that sits above the tab bar —
 * design/layout.md §7 ("navigation height + 16–24px"). The tab bar
 * itself already applies the device's safe-area inset.
 */
export const SEEKER_TAB_SCROLL_INSET = spacing['5xl']; // 48

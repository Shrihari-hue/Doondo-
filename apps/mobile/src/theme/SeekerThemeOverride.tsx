/**
 * SeekerThemeOverride — historically forced the seeker navigation subtree
 * onto the separate `seekerLight` (white/blue) palette while the employer
 * side stayed on the warm-dark palette.
 *
 * Post theme-unification (see THEME_UNIFICATION_PROMPT.md Step 0): both
 * roles now render the SAME theme — the root `ThemeProvider`'s `dark`
 * (or the user's manually-chosen `light`) — so there is no more
 * role-based branching to do here. This component is kept as a
 * pass-through (rather than deleted) so the ~57 seeker screens that still
 * wrap themselves in `<SeekerThemeOverride>` don't all need an import
 * edit; it now does nothing but render its children under whatever
 * theme the root provider already supplies.
 *
 * Safe to remove entirely in a follow-up cleanup pass once nothing new
 * is written against it — kept minimal here to avoid touching 57 call
 * sites in the same pass as the palette change itself.
 */

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function SeekerThemeOverride({ children }: Props) {
  return <>{children}</>;
}

/**
 * Work-type store — the seeker's Short Term / Long Term / Both choice.
 *
 * Doondo has two genuinely different worker experiences and this store is
 * the single switch between them:
 *
 *   SHORT_TERM — on-demand work. Quick Work offers you accept in one tap,
 *                plus nearby gig/shift postings. Immediate, local, fast.
 *   LONG_TERM  — regular employment. Full-time / part-time / contract
 *                postings you apply to and get interviewed for.
 *   BOTH       — both feeds, kept visually separate. Never interleaved.
 *
 * SHORT_TERM is the default for a fresh install, per the product rule.
 *
 * The choice lives on-device (secure-store) alongside `homeMode` and
 * Women's Mode — it is a view preference, not account state, so it needs
 * no server round-trip and no backend change. `hydrated` lets Home wait
 * for the stored value before its first fetch so a returning Long Term
 * worker never sees a flash of the Short Term feed.
 */

import { create } from 'zustand';
import { getSecure, setSecure } from '@/lib/secureStore';

export type WorkTypeMode = 'SHORT_TERM' | 'LONG_TERM' | 'BOTH';

interface WorkTypeState {
  shortTerm: boolean;
  longTerm: boolean;
  /** The stored preference has finished loading. */
  hydrated: boolean;

  /** Load the preference. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /**
   * Set the selection. At least one must stay on — a worker with neither
   * selected would see an empty app, which is never what they meant, so
   * turning off the last one is a no-op.
   */
  setSelection: (next: { shortTerm: boolean; longTerm: boolean }) => Promise<void>;
  /** Convenience for the Home segmented control's three buttons. */
  setMode: (mode: WorkTypeMode) => Promise<void>;
}

export function modeOf(shortTerm: boolean, longTerm: boolean): WorkTypeMode {
  if (shortTerm && longTerm) return 'BOTH';
  if (longTerm) return 'LONG_TERM';
  return 'SHORT_TERM';
}

export const useWorkTypeStore = create<WorkTypeState>((set, get) => ({
  shortTerm: true,
  longTerm: false,
  hydrated: false,

  async hydrate() {
    try {
      const stored = await getSecure('workTypePref');
      if (stored) {
        const parsed = JSON.parse(stored) as { shortTerm?: boolean; longTerm?: boolean };
        const shortTerm = parsed.shortTerm === true;
        const longTerm = parsed.longTerm === true;
        // A corrupt blob with neither set would strand the worker on an
        // empty Home — keep the Short Term default instead.
        if (shortTerm || longTerm) {
          set({ shortTerm, longTerm, hydrated: true });
          return;
        }
      }
      set({ hydrated: true });
    } catch {
      // Best-effort — a read failure leaves the Short Term default in place.
      set({ hydrated: true });
    }
  },

  async setSelection(next) {
    if (!next.shortTerm && !next.longTerm) return; // never leave the worker with nothing
    set({ shortTerm: next.shortTerm, longTerm: next.longTerm });
    try {
      await setSecure('workTypePref', JSON.stringify(next));
    } catch {
      /* best-effort — the in-memory value still holds for this session */
    }
  },

  async setMode(mode) {
    await get().setSelection({
      shortTerm: mode === 'SHORT_TERM' || mode === 'BOTH',
      longTerm: mode === 'LONG_TERM' || mode === 'BOTH',
    });
  },
}));

/** Read the current mode without subscribing to the two booleans separately. */
export function useWorkTypeMode(): WorkTypeMode {
  const shortTerm = useWorkTypeStore((s) => s.shortTerm);
  const longTerm = useWorkTypeStore((s) => s.longTerm);
  return modeOf(shortTerm, longTerm);
}

import { describe, expect, it } from 'vitest';
import type { PublicJob, JobType } from '@/api/types';
import { rankFeed, jobMatchesTrades, byNearest, isShortTermJob } from './workTypeRanking';

function job(overrides: Partial<PublicJob> & { id: string }): PublicJob {
  return {
    title: 'Job',
    description: '',
    type: 'gig' as JobType,
    pay: { amount: 50000, amountMax: null, period: 'fixed', currency: 'INR' },
    location: {
      address: '1 Main St',
      city: 'Bengaluru',
      area: null,
      pincode: null,
      coordinates: [77.5946, 12.9716],
    },
    skills: [],
    requiredSkillTestId: null,
    headcount: 1,
    crewHeadStartUntil: null,
    recurring: false,
    prepChecklist: [],
    project: null,
    escalationStage: 0,
    boostedUntil: null,
    workMode: 'onsite',
    schedule: null,
    status: 'active',
    urgent: false,
    safeForWomen: false,
    applicantsCount: 0,
    audioDescriptionUrl: null,
    audioDescriptionDurationSeconds: null,
    workplaceAnswers: null,
    womenSafety: null,
    womenSafetyTier: 'none',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PublicJob;
}

describe('isShortTermJob', () => {
  it('treats gig and shift as short term, and everything else as long term', () => {
    expect(isShortTermJob(job({ id: 'a', type: 'gig' }))).toBe(true);
    expect(isShortTermJob(job({ id: 'b', type: 'shift' }))).toBe(true);
    expect(isShortTermJob(job({ id: 'c', type: 'full_time' }))).toBe(false);
    expect(isShortTermJob(job({ id: 'd', type: 'part_time' }))).toBe(false);
    expect(isShortTermJob(job({ id: 'e', type: 'contract' }))).toBe(false);
  });
});

describe('jobMatchesTrades', () => {
  it('matches on an exact tagged trade slug', () => {
    expect(jobMatchesTrades(job({ id: 'a', skills: ['electrician'] }), ['electrician'])).toBe(true);
  });

  it('matches a free-text posting through the trade aliases', () => {
    // An employer who typed the title by hand instead of using the trade
    // picker must still reach the right worker's feed.
    const j = job({ id: 'a', title: 'Need AC repair guy today', skills: [] });
    expect(jobMatchesTrades(j, ['ac_technician'])).toBe(true);
  });

  it('does not match a trade the worker did not pick', () => {
    expect(jobMatchesTrades(job({ id: 'a', skills: ['mason'] }), ['electrician'])).toBe(false);
  });

  it('never matches when the worker has picked no trades', () => {
    expect(jobMatchesTrades(job({ id: 'a', skills: ['mason'] }), [])).toBe(false);
  });
});

describe('byNearest', () => {
  it('sorts nearer jobs first', () => {
    const near = job({ id: 'near', distanceMeters: 300 });
    const far = job({ id: 'far', distanceMeters: 4000 });
    expect([far, near].sort(byNearest).map((j) => j.id)).toEqual(['near', 'far']);
  });

  it('sinks jobs with an unknown distance to the bottom rather than the top', () => {
    // An absent distance is not "0 km away" — treating it as nearest
    // would put the least-known job at the very top of the feed.
    const unknown = job({ id: 'unknown' });
    const far = job({ id: 'far', distanceMeters: 9000 });
    expect([unknown, far].sort(byNearest).map((j) => j.id)).toEqual(['far', 'unknown']);
  });
});

describe('rankFeed', () => {
  const trades = ['electrician', 'plumber', 'mason', 'painter', 'cook'];

  it('puts headline-trade jobs before other-preference jobs before everything else', () => {
    const result = rankFeed(
      [
        job({ id: 'unrelated', skills: ['security_guard'], distanceMeters: 100 }),
        job({ id: 'secondary', skills: ['cook'], distanceMeters: 200 }),
        job({ id: 'primary', skills: ['electrician'], distanceMeters: 3000 }),
      ],
      trades,
    );

    // Note the distances: the preferred job is the FARTHEST of the three
    // and still leads, because preference outranks proximity.
    expect(result.preferred.map((j) => j.id)).toEqual(['primary']);
    expect(result.otherPreferences.map((j) => j.id)).toEqual(['secondary']);
    expect(result.more.map((j) => j.id)).toEqual(['unrelated']);
  });

  it('sorts nearest-first inside each section', () => {
    const result = rankFeed(
      [
        job({ id: 'far', skills: ['electrician'], distanceMeters: 5000 }),
        job({ id: 'near', skills: ['plumber'], distanceMeters: 400 }),
        job({ id: 'mid', skills: ['mason'], distanceMeters: 1200 }),
      ],
      trades,
    );
    expect(result.preferred.map((j) => j.id)).toEqual(['near', 'mid', 'far']);
  });

  it('drops nothing — every job lands in exactly one section', () => {
    const jobs = [
      job({ id: 'a', skills: ['electrician'] }),
      job({ id: 'b', skills: ['cook'] }),
      job({ id: 'c', skills: ['welder'] }),
      job({ id: 'd', skills: [] }),
    ];
    const result = rankFeed(jobs, trades);
    const seen = [...result.preferred, ...result.otherPreferences, ...result.more].map((j) => j.id);
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts everything in More jobs when the worker has picked no trades', () => {
    const jobs = [job({ id: 'a', skills: ['electrician'] }), job({ id: 'b', skills: [] })];
    const result = rankFeed(jobs, []);
    expect(result.preferred).toHaveLength(0);
    expect(result.otherPreferences).toHaveLength(0);
    expect(result.more).toHaveLength(2);
  });

  it('treats only the first four trades as headline preferences', () => {
    // The Preferred Jobs rail shows four chips, so the section under it
    // has to mean the same four — otherwise the rail explains a feed it
    // does not actually describe.
    const result = rankFeed([job({ id: 'fifth', skills: ['cook'] })], trades);
    expect(result.preferred).toHaveLength(0);
    expect(result.otherPreferences.map((j) => j.id)).toEqual(['fifth']);
  });
});

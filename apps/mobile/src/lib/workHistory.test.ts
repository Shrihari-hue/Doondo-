import { describe, expect, it, vi } from 'vitest';
import type { WorkExperience, PublicUser } from '@/api/types';
import {
  currentMonth,
  formatMonthYear,
  formatRange,
  formatTenure,
  sortWorkHistory,
  suggestedAlertFromUser,
  tenureMonths,
} from './workHistory';

function entry(overrides: Partial<WorkExperience> = {}): WorkExperience {
  return {
    company: 'Acme Co',
    role: 'Electrician',
    startDate: '2022-01',
    endDate: '2023-06',
    current: false,
    description: null,
    ...overrides,
  };
}

describe('formatMonthYear', () => {
  it('formats a valid YYYY-MM string', () => {
    expect(formatMonthYear('2024-04')).toBe('Apr 2024');
  });

  it('returns the raw input on malformed input', () => {
    expect(formatMonthYear('not-a-date')).toBe('not-a-date');
    expect(formatMonthYear('2024-13')).toBe('2024-13');
  });
});

describe('formatRange', () => {
  it('shows "Present" for a current job', () => {
    expect(formatRange(entry({ current: true, endDate: null }))).toBe('Jan 2022 — Present');
  });

  it('shows the end month for a past job', () => {
    expect(formatRange(entry())).toBe('Jan 2022 — Jun 2023');
  });
});

describe('sortWorkHistory', () => {
  it('sorts current jobs to the top regardless of start date', () => {
    const older = entry({ company: 'Old Co', startDate: '2015-01', current: false, endDate: '2016-01' });
    const current = entry({ company: 'New Co', startDate: '2020-01', current: true, endDate: null });
    const sorted = sortWorkHistory([older, current]);
    expect(sorted[0]!.company).toBe('New Co');
  });

  it('sorts non-current jobs newest-first by startDate', () => {
    const a = entry({ company: 'A', startDate: '2020-01' });
    const b = entry({ company: 'B', startDate: '2022-01' });
    const c = entry({ company: 'C', startDate: '2018-01' });
    const sorted = sortWorkHistory([a, b, c]);
    expect(sorted.map((e) => e.company)).toEqual(['B', 'A', 'C']);
  });

  it('does not mutate the input array', () => {
    const list = [entry({ company: 'A', startDate: '2020-01' }), entry({ company: 'B', startDate: '2022-01' })];
    const original = [...list];
    sortWorkHistory(list);
    expect(list).toEqual(original);
  });
});

describe('tenureMonths / formatTenure', () => {
  it('computes whole months between start and end inclusive', () => {
    // Jan 2022 -> Jun 2023 = 17 months apart, +1 inclusive = 18
    expect(tenureMonths(entry())).toBe(18);
  });

  it('formats under a month as "<1 mo"', () => {
    expect(formatTenure(0)).toBe('<1 mo');
  });

  it('formats months under a year as "N mo"', () => {
    expect(formatTenure(6)).toBe('6 mo');
  });

  it('formats whole years with no remainder as "N yr"', () => {
    expect(formatTenure(24)).toBe('2 yr');
  });

  it('formats years with a remainder as "N yr M mo"', () => {
    expect(formatTenure(18)).toBe('1 yr 6 mo');
  });

  it('returns 0 for an unparseable startDate', () => {
    expect(tenureMonths(entry({ startDate: 'garbage' }))).toBe(0);
  });
});

describe('currentMonth', () => {
  it('returns YYYY-MM for "now"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15)); // August 2026 (JS months are 0-indexed)
    expect(currentMonth()).toBe('2026-08');
    vi.useRealTimers();
  });
});

describe('suggestedAlertFromUser', () => {
  function user(overrides: Partial<PublicUser> = {}): PublicUser {
    return {
      workHistory: [],
      location: null,
      preferredJobTypes: [],
    } as unknown as PublicUser;
    void overrides;
  }

  it('returns null when the user has no work history', () => {
    expect(suggestedAlertFromUser(user())).toBeNull();
  });

  it('derives an alert from the most recent role and the saved city', () => {
    const u = {
      workHistory: [entry({ role: 'site electrician', startDate: '2020-01' })],
      location: { city: 'Pune', area: null, pincode: null, coordinates: null },
      preferredJobTypes: ['gig'],
    } as unknown as PublicUser;
    const alert = suggestedAlertFromUser(u);
    expect(alert).not.toBeNull();
    expect(alert!.name).toBe('Site Electrician in Pune');
    expect(alert!.query).toBe('site electrician');
    expect(alert!.city).toBe('Pune');
    expect(alert!.jobTypes).toEqual(['gig']);
  });

  it('falls back to "<role> jobs" when there is no saved city', () => {
    const u = {
      workHistory: [entry({ role: 'mason', startDate: '2020-01' })],
      location: null,
      preferredJobTypes: [],
    } as unknown as PublicUser;
    const alert = suggestedAlertFromUser(u);
    expect(alert!.name).toBe('Mason jobs');
    expect(alert!.city).toBeNull();
  });

  it('returns null when the latest role is blank', () => {
    const u = {
      workHistory: [entry({ role: '   ' })],
      location: null,
      preferredJobTypes: [],
    } as unknown as PublicUser;
    expect(suggestedAlertFromUser(u)).toBeNull();
  });
});

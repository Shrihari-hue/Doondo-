import { describe, expect, it } from 'vitest';
import type { PublicUser } from '@/api/types';
import { computeCompleteness } from './profileCompleteness';

function baseUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u1',
    email: 'seeker@example.com',
    role: 'seeker',
    name: 'Test Seeker',
    phone: null,
    isVerified: false,
    verificationStatus: 'unverified',
    phoneVerified: false,
    verifiedAt: null,
    linkedAccountIds: [],
    skills: [],
    bio: null,
    experienceYears: null,
    availability: null,
    preferredJobTypes: [],
    workType: null,
    teamSize: null,
    expectedSalary: null,
    location: null,
    photoUrl: null,
    rating: null,
    resumeUrl: null,
    resumeFilename: null,
    resumeMimeType: null,
    resumeSizeBytes: null,
    resumeUploadedAt: null,
    workHistory: [],
    workPhotos: [],
    education: [],
    skillDocuments: [],
    companyName: null,
    businessType: null,
    gstin: null,
    employerLocation: null,
    profileCompletion: 0,
    trustCircle: [],
    isPeerResponder: false,
    streaks: {
      apply: { current: 0, longest: 0, totalDays: 0, lastDate: null },
      course: { current: 0, longest: 0, totalDays: 0, lastDate: null },
      shift: { current: 0, longest: 0, totalDays: 0, lastDate: null },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeCompleteness', () => {
  it('scores 0 with every item missing for a null user', () => {
    const result = computeCompleteness(null);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(9);
    expect(result.next?.id).toBe('photo');
  });

  it('scores 0 for a brand new user with nothing filled in', () => {
    const result = computeCompleteness(baseUser());
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(9);
  });

  it('scores 100 when every item is present', () => {
    const result = computeCompleteness(
      baseUser({
        photoUrl: 'https://example.com/photo.jpg',
        phone: '+919876543210',
        isVerified: true,
        skills: ['plumbing', 'electrical', 'carpentry'],
        expectedSalary: { amount: 50000, amountMax: null, period: 'month', currency: 'INR' },
        bio: 'Experienced tradesperson.',
        workHistory: [
          { company: 'Acme', role: 'Electrician', startDate: '2020-01', endDate: null, current: true, description: null },
        ],
        workPhotos: [{ id: 'p1' } as unknown as PublicUser['workPhotos'][number]],
        location: { city: 'Bengaluru', area: null, pincode: null, coordinates: null },
      }),
    );
    expect(result.score).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.next).toBeNull();
  });

  it('returns missing items in ITEMS declaration order, not weight order', () => {
    // NOTE: CompletenessResult.missing's doc comment claims "ordered by
    // weight desc — highest impact first", but the implementation just
    // preserves the ITEMS array's declared order — it never sorts. This
    // test pins the actual (declaration-order) behavior; see the report
    // for this doc/behavior mismatch as a flagged finding, not a fix.
    const result = computeCompleteness(baseUser({ photoUrl: 'x' }));
    expect(result.missing.map((m) => m.id)).toEqual([
      'phone',
      'verified',
      'skills',
      'expectedSalary',
      'bio',
      'workHistory',
      'workPhotos',
      'location',
    ]);
    expect(result.next?.id).toBe('phone');
  });

  it('requires at least 3 skills for the skills item to count', () => {
    const twoSkills = computeCompleteness(baseUser({ skills: ['a', 'b'] }));
    expect(twoSkills.missing.some((m) => m.id === 'skills')).toBe(true);

    const threeSkills = computeCompleteness(baseUser({ skills: ['a', 'b', 'c'] }));
    expect(threeSkills.missing.some((m) => m.id === 'skills')).toBe(false);
  });

  it('requires expectedSalary.amount to be greater than zero', () => {
    const zeroAmount = computeCompleteness(
      baseUser({ expectedSalary: { amount: 0, amountMax: null, period: 'day', currency: 'INR' } }),
    );
    expect(zeroAmount.missing.some((m) => m.id === 'expectedSalary')).toBe(true);
  });

  it('treats an empty-string bio as missing', () => {
    const result = computeCompleteness(baseUser({ bio: '   ' }));
    expect(result.missing.some((m) => m.id === 'bio')).toBe(true);
  });
});

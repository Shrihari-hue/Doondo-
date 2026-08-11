/**
 * Seed script — wipes and inserts demo data for local development.
 *
 * Usage:
 *   pnpm --filter @doondo/backend seed
 *
 * What it inserts:
 *   - 1 demo employer user (employer@doondo.dev / Password123)
 *   - 12 jobs scattered around a configurable lat/lng (defaults to
 *     Bengaluru / Indiranagar) within a ~3km radius — realistic for the
 *     "find work within walking distance" pitch.
 *
 * The seed only touches employer-tagged users and jobs — it never
 * deletes seekers, so you can sign up an account and run the seed
 * repeatedly without losing your test seeker.
 *
 * Configurable via env (all optional):
 *   SEED_LAT=12.9716   center latitude
 *   SEED_LNG=77.5946   center longitude
 *   SEED_CITY=Bengaluru
 */

import './env-loader';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs, users, type ApplicationStatus, type JobType, type PayPeriod } from '@/db/schema';
import { logger } from '@/lib/logger';
import { hashPassword } from '@/lib/password';

const SEED_LAT = Number(process.env.SEED_LAT ?? 12.9716);
const SEED_LNG = Number(process.env.SEED_LNG ?? 77.5946);
const SEED_CITY = process.env.SEED_CITY ?? 'Bengaluru';

interface JobSeed {
  title: string;
  description: string;
  type: JobType;
  amount: number; // smallest unit (paise)
  amountMax?: number;
  period: PayPeriod;
  area: string;
  /** Offset from center in [lng, lat] degrees. ~0.01 ≈ 1.1km. */
  offset: [number, number];
  skills: string[];
  hoursPerDay?: number;
}

const SEEDS: JobSeed[] = [
  {
    title: 'Delivery rider — bike with you',
    description:
      'Run food deliveries in the area. Earnings paid daily. Need own two-wheeler and a smartphone.',
    type: 'gig',
    amount: 60_000, // ₹600
    period: 'day',
    area: 'Indiranagar',
    offset: [0.005, 0.004],
    skills: ['driving', 'navigation'],
    hoursPerDay: 8,
  },
  {
    title: 'Counter staff — bakery',
    description:
      'Handle morning rush at our 100ft Road bakery. Take orders, run the till, restock display.',
    type: 'shift',
    amount: 45_000, // ₹450
    period: 'day',
    area: 'Indiranagar',
    offset: [-0.006, 0.002],
    skills: ['customer_service', 'cash_handling'],
    hoursPerDay: 6,
  },
  {
    title: 'Salon assistant',
    description:
      'Weekend help at a unisex salon. Greet clients, manage appointments, basic shampoo & blow-dry.',
    type: 'part_time',
    amount: 30_000,
    period: 'day',
    area: 'HAL 2nd Stage',
    offset: [0.012, -0.004],
    skills: ['customer_service'],
    hoursPerDay: 5,
  },
  {
    title: 'Warehouse picker',
    description:
      'Pull and pack online orders at a quick-commerce hub. Two shifts available.',
    type: 'full_time',
    amount: 22_000_00, // ₹22,000/month
    amountMax: 28_000_00,
    period: 'month',
    area: 'Domlur',
    offset: [-0.018, -0.012],
    skills: ['stamina', 'attention_to_detail'],
    hoursPerDay: 9,
  },
  {
    title: 'House cleaning helper',
    description:
      'Twice-a-week deep clean for a 2BHK flat. Honest, reliable, English not required.',
    type: 'gig',
    amount: 50_000,
    period: 'day',
    area: 'Indiranagar',
    offset: [0.003, 0.008],
    skills: ['cleaning'],
    hoursPerDay: 4,
  },
  {
    title: 'Cafe barista — espresso bar',
    description:
      'Pull shots, steam milk, run the espresso machine. Training given for the right person.',
    type: 'shift',
    amount: 18_000_00, // ₹18,000/month
    period: 'month',
    area: '12th Main',
    offset: [-0.002, -0.006],
    skills: ['barista', 'customer_service'],
    hoursPerDay: 8,
  },
  {
    title: 'Electrician — small jobs',
    description:
      'Fan installation, switch board repairs, fixture mounting. Need own basic tools.',
    type: 'gig',
    amount: 80_000,
    period: 'day',
    area: 'CV Raman Nagar',
    offset: [0.022, -0.008],
    skills: ['electrical', 'wiring'],
  },
  {
    title: 'Office runner / errands',
    description:
      'Drop documents, pick up supplies, basic admin help for a small design studio.',
    type: 'part_time',
    amount: 12_000_00,
    period: 'month',
    area: 'Indiranagar',
    offset: [0.009, -0.002],
    skills: ['driving', 'punctuality'],
    hoursPerDay: 5,
  },
  {
    title: 'Catering helper — weekend events',
    description:
      'Set up, serve, clean for weekend events. Saturdays and Sundays only.',
    type: 'gig',
    amount: 70_000,
    period: 'day',
    area: 'Koramangala',
    offset: [-0.014, -0.018],
    skills: ['food_service', 'stamina'],
  },
  {
    title: 'Tailor — alterations',
    description:
      'Hem pants, take in dresses, basic mending at a boutique. Experience with sewing machine required.',
    type: 'full_time',
    amount: 20_000_00,
    period: 'month',
    area: 'Domlur',
    offset: [-0.016, -0.01],
    skills: ['tailoring', 'sewing'],
    hoursPerDay: 8,
  },
  {
    title: 'Petrol pump attendant — night shift',
    description:
      'Operate fuel pumps, handle cash, maintain logbook. Night shift 10pm to 6am.',
    type: 'shift',
    amount: 16_000_00,
    period: 'month',
    area: 'Old Madras Road',
    offset: [0.018, -0.005],
    skills: ['cash_handling', 'punctuality'],
    hoursPerDay: 8,
  },
  {
    title: 'Tutor — class 5 to 8 maths',
    description:
      'Evening home tutoring for a class 7 student. 1 hour, 5 days a week.',
    type: 'part_time',
    amount: 8_000_00,
    period: 'month',
    area: 'HAL 2nd Stage',
    offset: [0.011, -0.003],
    skills: ['mathematics', 'teaching'],
    hoursPerDay: 1,
  },
];

async function main() {
  const db = getDb();
  logger.info('seed: connected');

  // Upsert the demo employer.
  const email = 'employer@doondo.dev';
  const passwordHash = await hashPassword('Password123');
  const [existingEmployer] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const [employer] = existingEmployer
    ? [existingEmployer]
    : await db
        .insert(users)
        .values({
          email,
          passwordHash,
          name: 'Doondo Demo Employer',
          role: 'employer',
          isVerified: true,
          companyName: 'Doondo Demo Co.',
          businessType: 'agency',
        })
        .returning();
  logger.info({ employerId: employer!.id }, 'seed: employer ready');

  // Wipe existing demo jobs (only ones owned by the seed employer).
  const wiped = await db.delete(jobs).where(eq(jobs.employerId, employer!.id)).returning({ id: jobs.id });
  logger.info({ deleted: wiped.length }, 'seed: wiped previous jobs');

  // Insert the seeds.
  const rows = SEEDS.map((s) => ({
    employerId: employer!.id,
    title: s.title,
    description: s.description,
    type: s.type,
    payAmount: s.amount,
    payAmountMax: s.amountMax ?? null,
    payPeriod: s.period,
    payCurrency: 'INR',
    address: `${s.area}, ${SEED_CITY}`,
    city: SEED_CITY,
    area: s.area,
    pincode: null,
    geo: { x: SEED_LNG + s.offset[0], y: SEED_LAT + s.offset[1] },
    skills: s.skills,
    schedule: s.hoursPerDay ? { hoursPerDay: s.hoursPerDay } : null,
    status: 'active' as const,
  }));

  const inserted = await db.insert(jobs).values(rows).returning();
  logger.info({ count: inserted.length }, 'seed: jobs inserted');

  // ─── Demo seekers + applications ─────────────────────────────────────────
  // 4 seekers, each scattered across a few of the inserted jobs in a mix of
  // statuses. Gives the employer dashboard real content on first run.
  const SEEKERS: Array<{
    email: string;
    name: string;
    skills: string[];
  }> = [
    { email: 'seeker.priya@doondo.dev', name: 'Priya Rao', skills: ['cleaning', 'cooking'] },
    {
      email: 'seeker.arjun@doondo.dev',
      name: 'Arjun Menon',
      skills: ['driving', 'navigation'],
    },
    {
      email: 'seeker.fatima@doondo.dev',
      name: 'Fatima Sheikh',
      skills: ['customer_service', 'cash_handling'],
    },
    {
      email: 'seeker.dev@doondo.dev',
      name: 'Dev Sharma',
      skills: ['electrical', 'wiring'],
    },
  ];

  const seekerHash = await hashPassword('Password123');
  const seekerDocs = await Promise.all(
    SEEKERS.map(async (s) => {
      const [existing] = await db.select().from(users).where(eq(users.email, s.email)).limit(1);
      if (existing) return existing;
      const [created] = await db
        .insert(users)
        .values({
          email: s.email,
          passwordHash: seekerHash,
          name: s.name,
          role: 'seeker',
          isVerified: false,
          skills: s.skills,
          location: {
            city: SEED_CITY,
            area: 'Indiranagar',
            pincode: null,
            coordinates: [SEED_LNG + 0.001, SEED_LAT + 0.001],
          },
        })
        .returning();
      return created!;
    }),
  );
  logger.info({ count: seekerDocs.length }, 'seed: seekers ready');

  // Wipe prior demo applications so re-running the seed is idempotent.
  const seekerIds = seekerDocs.map((s) => s.id);
  await db.delete(applications).where(inArray(applications.seekerId, seekerIds));

  // Spread applications across the first 6 jobs in mixed statuses so each
  // status pill is reachable in the employer applicant list view.
  const targetJobs = inserted.slice(0, 6);
  const STATUS_CYCLE: ApplicationStatus[] = [
    'pending',
    'viewed',
    'shortlisted',
    'pending',
    'rejected',
    'hired',
  ];

  const now = Date.now();
  const appRows = targetJobs.map((job, idx) => {
    const seeker = seekerDocs[idx % seekerDocs.length]!;
    const status = STATUS_CYCLE[idx]!;
    const appliedAt = new Date(now - (idx + 1) * 1000 * 60 * 60 * 6);
    const transitionAt = new Date(now - idx * 1000 * 60 * 60 * 2);

    return {
      seekerId: seeker.id,
      jobId: job.id,
      employerId: employer!.id,
      status,
      appliedAt,
      viewedAt: status !== 'pending' ? transitionAt : null,
      shortlistedAt:
        status === 'shortlisted' || status === 'hired' ? transitionAt : null,
      rejectedAt: status === 'rejected' ? transitionAt : null,
      hiredAt: status === 'hired' ? transitionAt : null,
    };
  });

  await db.insert(applications).values(appRows);
  logger.info({ count: appRows.length }, 'seed: applications inserted');

  // Bump applicantsCount denorm on the affected jobs.
  await Promise.all(
    targetJobs.map((j) => db.update(jobs).set({ applicantsCount: 1 }).where(eq(jobs.id, j.id))),
  );

  logger.info('seed: done');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.fatal({ err }, 'seed failed');
    process.exit(1);
  });

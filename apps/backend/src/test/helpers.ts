/**
 * Shared fixtures for integration tests — real Postgres, no mocking.
 *
 * Every `createTest*` helper inserts directly into the table (bypassing
 * the HTTP/service layer for setup speed) and returns the row. Callers
 * are responsible for tracking the ids they create and passing them to
 * `cleanupTestData` in an `afterAll`/`afterEach` — several FKs here are
 * `onDelete: 'restrict'` (applications/conversations -> users/jobs), so
 * cleanup order matters: conversations (cascades messages) -> applications
 * -> jobs -> users (cascades refreshTokens/userLinks/workPhotos).
 */
import { randomUUID } from 'node:crypto';
import { inArray, or } from 'drizzle-orm';
import { connectPg, disconnectPg, getDb, type Db } from '@/db/client';
import {
  applications,
  availabilities,
  conversations,
  jobs,
  notifications,
  paymentIntents,
  quickWorkRequests,
  ratings,
  serviceCategories,
  services,
  users,
  walletTransactions,
  workerServiceProfiles,
  type ApplicationStatus,
  type JobType,
  type PayPeriod,
} from '@/db/schema';
import { hashPassword } from '@/lib/password';
import type { UserRole } from '@/lib/jwt';

let connected = false;

/** Idempotent — safe to call at the top of every test file. */
export function ensureDb(): Db {
  if (!connected) {
    connectPg();
    connected = true;
  }
  return getDb();
}

export async function closeDb(): Promise<void> {
  if (!connected) return;
  await disconnectPg();
  connected = false;
}

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export interface TestUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  plainPassword: string;
}

export async function createTestUser(
  role: Exclude<UserRole, 'admin'>,
  overrides: {
    email?: string;
    password?: string;
    name?: string;
    phone?: string | null;
    isActive?: boolean;
    companyName?: string;
  } = {},
): Promise<TestUser> {
  const db = ensureDb();
  const plainPassword = overrides.password ?? 'Test1234pass';
  const passwordHash = await hashPassword(plainPassword);
  const [row] = await db
    .insert(users)
    .values({
      email: overrides.email ?? `test-${randomUUID()}@doondo-test.dev`,
      passwordHash,
      role,
      name: overrides.name ?? (role === 'employer' ? 'Test Employer' : 'Test Seeker'),
      phone: overrides.phone === undefined ? `+91${randomDigits(10)}` : overrides.phone,
      isActive: overrides.isActive ?? true,
      companyName: role === 'employer' ? (overrides.companyName ?? 'Test Co') : undefined,
    })
    .returning();
  const user = row!;
  return { id: user.id, email: user.email, role: user.role, name: user.name, plainPassword };
}

export async function createTestJob(
  employerId: string,
  overrides: {
    title?: string;
    type?: JobType;
    payAmount?: number;
    payPeriod?: PayPeriod;
    city?: string;
    status?: 'active' | 'paused' | 'filled' | 'expired';
  } = {},
) {
  const db = ensureDb();
  const [row] = await db
    .insert(jobs)
    .values({
      employerId,
      title: overrides.title ?? 'Test Job',
      description: 'A job posted for automated testing.',
      type: overrides.type ?? 'gig',
      payAmount: overrides.payAmount ?? 500,
      payPeriod: overrides.payPeriod ?? 'day',
      address: '123 Test Street',
      city: overrides.city ?? 'Bengaluru',
      // [lng, lat] — a fixed point in Bengaluru; geo distance isn't under
      // test here, only that the NOT NULL geometry column is satisfied.
      geo: { x: 77.5946, y: 12.9716 },
      status: overrides.status ?? 'active',
    })
    .returning();
  return row!;
}

export async function createTestApplication(
  seekerId: string,
  employerId: string,
  jobId: string,
  overrides: { status?: ApplicationStatus } = {},
) {
  const db = ensureDb();
  const [row] = await db
    .insert(applications)
    .values({
      seekerId,
      employerId,
      jobId,
      status: overrides.status ?? 'pending',
    })
    .returning();
  return row!;
}

// ─── Quick Work fixtures ─────────────────────────────────────────────────────

/** A throwaway category+service pair so Quick Work tests don't depend on seeded catalog data. */
export async function createTestService(
  overrides: { requiresVerification?: boolean } = {},
): Promise<{ categoryId: string; serviceId: string }> {
  const db = ensureDb();
  const suffix = randomUUID().slice(0, 8);
  const [category] = await db
    .insert(serviceCategories)
    .values({ name: `Test Category ${suffix}`, slug: `test-category-${suffix}`, icon: 'tool' })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      categoryId: category!.id,
      name: `Test Service ${suffix}`,
      slug: `test-service-${suffix}`,
      requiresVerification: overrides.requiresVerification ?? false,
    })
    .returning();
  return { categoryId: category!.id, serviceId: service!.id };
}

/** Direct insert of a fully-formed quick_work_requests row — bypasses the draft/post flow for setup speed. */
export async function createTestQuickWorkRequest(
  employerId: string,
  serviceId: string,
  overrides: Partial<typeof quickWorkRequests.$inferInsert> = {},
): Promise<typeof quickWorkRequests.$inferSelect> {
  const db = ensureDb();
  const [row] = await db
    .insert(quickWorkRequests)
    .values({
      employerId,
      serviceId,
      title: 'Test Quick Work request',
      geo: { x: 77.5946, y: 12.9716 }, // Bengaluru — matches createTestJob's fixed point
      city: 'Bengaluru',
      status: 'draft',
      isImmediate: true,
      ...overrides,
    })
    .returning();
  return row!;
}

export interface TestDataIds {
  userIds?: string[];
  jobIds?: string[];
  applicationIds?: string[];
  conversationIds?: string[];
  quickWorkRequestIds?: string[];
  serviceIds?: string[];
  categoryIds?: string[];
}

/** Deletes in FK-safe order. Missing/empty lists are no-ops. */
export async function cleanupTestData(ids: TestDataIds): Promise<void> {
  const db = ensureDb();
  if (ids.conversationIds?.length) {
    await db.delete(conversations).where(inArray(conversations.id, ids.conversationIds));
  }
  if (ids.userIds?.length) {
    // Ratings/conversations/paymentIntents can reference a Quick Work
    // request with onDelete: 'restrict' — must go before the request
    // rows below. Filtering by our own tracked userIds is precise enough
    // (every rating/conversation/intent a test creates involves a
    // tracked test user on at least one side).
    await db.delete(ratings).where(or(inArray(ratings.reviewerId, ids.userIds), inArray(ratings.revieweeId, ids.userIds)));
    await db
      .delete(conversations)
      .where(or(inArray(conversations.employerId, ids.userIds), inArray(conversations.seekerId, ids.userIds)));
    await db
      .delete(paymentIntents)
      .where(or(inArray(paymentIntents.employerId, ids.userIds), inArray(paymentIntents.seekerId, ids.userIds)));
    // Hiring an application credits a wallet_transactions row (userId +
    // applicationId + jobId, all onDelete: 'restrict') as a side effect —
    // has to go before applications/jobs are deleted below. Quick Work
    // payments land the same way (userId + quickWorkRequestId).
    await db.delete(walletTransactions).where(inArray(walletTransactions.userId, ids.userIds));
  }
  if (ids.quickWorkRequestIds?.length) {
    // Cascades quick_work_offers + quick_work_status_history automatically.
    await db.delete(quickWorkRequests).where(inArray(quickWorkRequests.id, ids.quickWorkRequestIds));
  }
  if (ids.userIds?.length) {
    await db.delete(availabilities).where(inArray(availabilities.seekerId, ids.userIds));
    await db.delete(workerServiceProfiles).where(inArray(workerServiceProfiles.workerId, ids.userIds));
  }
  if (ids.applicationIds?.length) {
    await db.delete(applications).where(inArray(applications.id, ids.applicationIds));
  }
  if (ids.jobIds?.length) {
    await db.delete(jobs).where(inArray(jobs.id, ids.jobIds));
  }
  if (ids.serviceIds?.length) {
    await db.delete(services).where(inArray(services.id, ids.serviceIds));
  }
  if (ids.categoryIds?.length) {
    await db.delete(serviceCategories).where(inArray(serviceCategories.id, ids.categoryIds));
  }
  if (ids.userIds?.length) {
    // Employer/hire/reject transitions write an in-app notification row
    // (recipientId -> users, onDelete: 'restrict') as a side effect —
    // has to go before the user delete or it FK-violates.
    await db.delete(notifications).where(inArray(notifications.recipientId, ids.userIds));
    await db.delete(users).where(inArray(users.id, ids.userIds));
  }
}

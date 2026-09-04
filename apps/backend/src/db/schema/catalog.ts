/**
 * Shared Service Catalog — the single source of truth for "what kind of
 * work is this" across Jobs, Quick Work, and Scheduled Work.
 *
 * Per employer-plan.md §8 / seeker-plan.md §2.8: nothing like this exists
 * anywhere in the schema today. `jobs.skills` and `users.skills` are
 * free-text `text[]`; the two curated catalogues that DO exist
 * (`apps/mobile/src/lib/trades.ts`, `apps/backend/src/modules/skills/
 * skill.catalogue.ts`) are UI/showcase helpers with no database
 * representation and no stable id — a request can't join on them.
 *
 * This table pair is genuinely new infrastructure, not an extension of
 * either existing catalogue. Its seed data (see scripts/seedServiceCatalog.ts)
 * is cross-walked against both so overlapping slugs stay stable and
 * `users.skills`/`availabilities.tradesAvailable` string matches keep
 * resolving sensibly.
 *
 * One catalog, two consumers (employer request-creation UI, worker
 * service-eligibility UI) — see employer-plan.md §8 / seeker-plan.md §8.
 * Matching (`availabilities.serviceIds`, `quick_work_requests.serviceId`)
 * is driven by `services.id`, never by name — per the brief's explicit
 * "do not use display names as the primary matching identifier" rule.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    /** Feather icon name — matches the convention already used across the mobile app. */
    icon: varchar('icon', { length: 60 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('service_categories_slug_unique').on(t.slug),
    index('service_categories_sort_order_idx').on(t.sortOrder),
    index('service_categories_is_active_idx').on(t.isActive),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    /** Feather icon name; falls back to the parent category's icon when unset. */
    icon: varchar('icon', { length: 60 }),
    isActive: boolean('is_active').notNull().default(true),
    requiresVerification: boolean('requires_verification').notNull().default(false),
    requiresQualification: boolean('requires_qualification').notNull().default(false),
    requiresLicense: boolean('requires_license').notNull().default(false),
    supportsQuickWork: boolean('supports_quick_work').notNull().default(true),
    supportsScheduledWork: boolean('supports_scheduled_work').notNull().default(true),
    supportsTraditionalJob: boolean('supports_traditional_job').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('services_slug_unique').on(t.slug),
    index('services_category_id_idx').on(t.categoryId),
    index('services_is_active_idx').on(t.isActive),
    // Plain btree on name — good enough for ILIKE prefix search at this
    // catalog's size (~350 rows); upgrade to a trigram/GIN index only if
    // search volume or catalog size grows enough to need it.
    index('services_name_idx').on(t.name),
  ],
);

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type Service = typeof services.$inferSelect;

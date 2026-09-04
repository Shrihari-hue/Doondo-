/**
 * Seed script — the shared Service Catalog (service_categories + services).
 *
 * Usage:
 *   pnpm --filter @doondo/backend seed:catalog
 *
 * Idempotent / re-runnable by design: categories and services are upserted
 * by their stable `slug` (unique index), so running this repeatedly never
 * creates duplicates — it just updates name/icon/flags if they changed.
 *
 * This is the ONE catalog consumed by both employer-plan.md §8 (Quick Work
 * request creation) and seeker-plan.md §8 (worker service eligibility) —
 * do not create a second seed script or a second table pair for either side.
 *
 * Cross-walk: where a service here is the same real-world trade already
 * curated in `apps/mobile/src/lib/trades.ts` / `apps/backend/src/modules/
 * skills/skill.catalogue.ts`, its slug is pinned to match (CROSSWALK below)
 * so `users.skills` / `availabilities.tradesAvailable` free-text values
 * keep resolving sensibly against the new id-based catalog. Everything
 * else gets a fresh slug derived from its name.
 *
 * Dedup policy: the product brief's 24-category list repeats several real
 * -world services across categories verbatim (e.g. "Electrician" appears
 * under Home & Property, Construction, and Electrical & Energy). Each
 * distinct real service is inserted exactly ONCE, under the category it
 * fits best — re-listing an identical service under a second category
 * would be the exact "duplicate architecture" the plan says not to build.
 * Where the brief's wording differs enough to be a genuinely distinct
 * service (e.g. "Car mechanic" vs "Bike mechanic"), both are kept.
 */

import './env-loader';
import { connectPg, disconnectPg, getDb } from '@/db/client';
import { serviceCategories, services } from '@/db/schema';
import { logger } from '@/lib/logger';

// ─── Slug helpers ────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Pinned slugs for services that are the same real trade as an existing curated catalogue entry. */
const CROSSWALK: Record<string, string> = {
  electrician: 'electrician',
  plumber: 'plumber',
  'ac technician': 'ac_technician',
  carpenter: 'carpenter',
  painter: 'painter',
  mason: 'mason',
  welding: 'welder',
  'car mechanic': 'mechanic',
  'bike mechanic': 'mechanic_bike',
  cook: 'cook',
  baker: 'baker',
  'driver — light vehicle': 'driver_light',
  'car driver': 'driver_light',
  'driver — heavy vehicle': 'driver_heavy',
  'truck driver': 'driver_heavy',
  delivery: 'delivery',
  'delivery partner': 'delivery',
  'waiter / server': 'waiter',
  waiter: 'waiter',
  tailor: 'tailor',
  'security guard': 'security_guard',
  gardening: 'gardener',
  gardener: 'gardener',
  caregiver: 'caregiver',
  'nanny / babysitter': 'nanny',
  babysitter: 'nanny',
  accountant: 'accountant',
  'home tutor': 'tutor',
  telecaller: 'telecaller',
  'domestic help': 'domestic_help',
  housekeeper: 'domestic_help',
  'home cleaning': 'cleaner',
  'kitchen helper': 'kitchen_helper',
  salesperson: 'shop_assistant',
  'store assistant': 'shop_assistant',
  cashier: 'cashier',
  'warehouse worker': 'warehouse',
  'office assistant': 'office_admin',
  receptionist: 'office_admin',
  'data-entry operator': 'data_entry',
  'hair stylist': 'salon',
  barber: 'salon',
  'mehendi artist': 'mehndi_artist',
  decorator: 'decorator',
  photographer: 'photographer',
  helper: 'helper',
};

function slugFor(name: string): string {
  return CROSSWALK[name.toLowerCase()] ?? slugify(name);
}

// ─── Category / service definitions ─────────────────────────────────────────

interface ServiceDef {
  name: string;
  requiresVerification?: boolean;
  requiresQualification?: boolean;
  requiresLicense?: boolean;
  /** Default true for all three — set explicitly false only where a service genuinely can't be one of them. */
  supportsQuickWork?: boolean;
  supportsScheduledWork?: boolean;
  supportsTraditionalJob?: boolean;
}

interface CategoryDef {
  name: string;
  icon: string;
  services: (string | ServiceDef)[];
}

const def = (name: string, opts: Partial<ServiceDef> = {}): ServiceDef => ({ name, ...opts });

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Home & Property Services',
    icon: 'home',
    services: [
      'Electrician', 'Plumber', 'AC Technician', 'Refrigerator Repair', 'Washing Machine Repair',
      'Dishwasher Repair', 'Microwave Repair', 'Water Purifier / RO Technician', 'Geyser Repair',
      'TV Repair', 'Appliance Installation', 'Carpenter', 'Furniture Assembly', 'Furniture Repair',
      'Painter', 'POP / False Ceiling', 'Flooring', 'Tiling', 'Mason', 'Construction Worker',
      'Waterproofing', 'Roofing', 'Welding', 'Glass Work', 'Aluminium Work', 'UPVC Work',
      'Door Repair', 'Lock Repair', 'Locksmith', 'Pest Control', 'Home Cleaning', 'Deep Cleaning',
      'Bathroom Cleaning', 'Kitchen Cleaning', 'Sofa Cleaning', 'Carpet Cleaning', 'Tank Cleaning',
      'Chimney Cleaning', 'Solar Panel Cleaning', 'Gardening', 'Landscaping', 'Packers & Movers',
      'Home Shifting', 'Junk Removal',
    ],
  },
  {
    name: 'Automotive & Vehicle',
    icon: 'truck',
    services: [
      'Car Mechanic', 'Car Servicing', 'Car AC Repair', 'Car Electrical', 'Car Battery Replacement',
      'Tyre Replacement', 'Puncture Repair', 'Wheel Alignment', 'Wheel Balancing', 'Car Washing',
      'Car Detailing', 'Car Polishing', 'Denting & Painting', 'Windshield Repair', 'Towing',
      'Roadside Assistance', 'Bike Mechanic', 'Bike Servicing', 'Bike Electrical', 'Bike Washing',
      'Bike Detailing', 'Auto-Rickshaw Repair', 'Tractor Repair', 'Truck Repair',
      'Commercial Vehicle Repair', 'EV Service', 'EV Charging Assistance',
    ],
  },
  {
    name: 'Electronics & Technology',
    icon: 'cpu',
    services: [
      'Mobile Repair', 'Laptop Repair', 'Desktop Repair', 'Computer Technician', 'Printer Repair',
      'CCTV Installation', 'CCTV Repair', 'Wi-Fi Installation', 'Network Technician',
      'Router Configuration', 'Smart TV Setup', 'TV Repair (Electronics)', 'Home Theatre Installation',
      'Speaker Repair', 'Gaming Console Repair', 'Data Recovery', 'Software Installation',
      'OS Installation', 'Computer Formatting', 'IT Support', 'Cybersecurity Support',
      'Smart-Home Installation', 'Biometric Installation', 'Access-Control Installation',
    ],
  },
  {
    name: 'Construction & Skilled Trades',
    icon: 'tool',
    services: [
      'Construction Helper', 'Fabricator', 'Steel Worker', 'Aluminium Worker', 'Tile Worker',
      'Marble Worker', 'Granite Worker', 'Flooring Worker', 'POP Worker', 'False-Ceiling Worker',
      'Waterproofing Worker', 'Roofing Worker', 'Scaffolding Worker', 'Excavation Worker',
      'Concrete Worker', 'Brick Worker', 'Demolition Worker', 'Interior Worker', 'Glass Worker',
      'UPVC Worker',
    ],
  },
  {
    name: 'Cleaning & Maintenance',
    icon: 'droplet',
    services: [
      'House Cleaner', 'Office Cleaner', 'Shop Cleaner', 'Window Cleaner', 'Water-Tank Cleaner',
      'Swimming-Pool Cleaner', 'Building Cleaner', 'Parking Cleaner', 'Garden Maintenance',
      'Facility Maintenance',
    ],
  },
  {
    name: 'Food & Kitchen',
    icon: 'coffee',
    services: [
      'Cook', 'Home Chef', 'Party Cook', 'Catering Worker', 'Kitchen Helper', 'Dishwasher (Kitchen)',
      'Baker', 'Cake Maker', 'Tiffin Service', 'Food Preparation Worker', 'Waiter / Server',
      'Bartender', 'Restaurant Helper', 'Delivery Partner',
    ],
  },
  {
    name: 'Personal & Family Services',
    icon: 'users',
    services: [
      'Babysitter', 'Elder-Care Assistant', 'Caregiver', 'Home Attendant', 'Personal Assistant',
      'Driver — Light Vehicle', 'Housekeeper', 'Laundry Worker', 'Ironing Service',
      'Beauty Service (Home Visit)', 'Mehendi Artist', 'Tailor', 'Alteration Service',
    ],
  },
  {
    name: 'Beauty & Wellness',
    icon: 'scissors',
    services: [
      'Hair Stylist', 'Barber', 'Makeup Artist', 'Bridal Makeup', 'Nail Technician', 'Beautician',
      'Salon Worker', 'Massage Therapist', 'Personal Trainer', 'Yoga Instructor', 'Fitness Trainer',
    ],
  },
  {
    name: 'Delivery, Logistics & Moving',
    icon: 'package',
    services: [
      'Parcel Delivery', 'Grocery Delivery', 'Food Delivery', 'Courier Worker', 'Loading Worker',
      'Unloading Worker', 'Packers', 'Movers', 'Warehouse Worker', 'Picker', 'Packer',
      'Inventory Worker', 'Forklift Operator', 'Logistics Assistant', 'Van Driver', 'Tempo Driver',
      'Bike Delivery',
    ],
  },
  {
    name: 'Retail & Shop Workers',
    icon: 'shopping-bag',
    services: [
      'Salesperson', 'Cashier', 'Store Assistant', 'Shop Helper', 'Stock Keeper',
      'Inventory Assistant', 'Billing Operator', 'Merchandiser', 'Shelf-Stocker',
      'Customer-Support Staff (Retail)', 'Store Manager', 'Promoter', 'Field Sales Worker',
    ],
  },
  {
    name: 'Office & Business Services',
    icon: 'briefcase',
    services: [
      'Receptionist', 'Office Assistant', 'Data-Entry Operator', 'Computer Operator',
      'Bookkeeper', 'Sales Executive', 'Marketing Assistant', 'Telecaller',
      'Customer-Support Executive', 'HR Assistant', 'Admin Assistant', 'Field Executive',
      'Survey Worker', 'Event Staff', 'Temporary Staff', 'Office Helper',
    ],
  },
  {
    name: 'Events & Functions',
    icon: 'calendar',
    services: [
      'Event Manager', 'Event Coordinator', 'Wedding Decorator', 'Stage Worker', 'Sound Technician',
      'DJ', 'Videographer', 'Drone Operator', 'Lighting Technician', 'Catering Staff (Events)',
      'Event Security', 'Usher', 'Host / MC', 'Flower Decorator',
    ],
  },
  {
    name: 'Education & Tutoring',
    icon: 'book-open',
    services: [
      'Home Tutor', 'Mathematics Tutor', 'Science Tutor', 'English Tutor', 'Language Tutor',
      'Coding Tutor', 'Music Teacher', 'Dance Teacher', 'Art Teacher', 'Sports Coach',
      'Exam Preparation Tutor', 'Special-Skills Instructor',
    ],
  },
  {
    name: 'Freelance & Digital Work',
    icon: 'code',
    services: [
      'Graphic Designer', 'UI/UX Designer', 'Video Editor', 'Photo Editor', 'Animator',
      '3D Designer', 'Web Developer', 'Mobile Developer', 'Software Developer', 'Content Writer',
      'Copywriter', 'Translator', 'Voice-Over Artist', 'Social-Media Manager', 'Digital Marketer',
      'SEO Specialist', 'Virtual Assistant',
    ],
  },
  {
    name: 'Media & Creative',
    icon: 'camera',
    services: [
      'Photographer', 'Wedding Photographer', 'Product Photographer', 'Motion Designer',
      'Illustrator', 'Voice Artist', 'Musician', 'Singer', 'Content Creator',
      'Social-Media Creator',
    ],
  },
  {
    name: 'Agriculture & Rural Work',
    icon: 'sun',
    services: [
      'Farm Worker', 'Agricultural Laborer', 'Tractor Operator', 'Irrigation Worker',
      'Harvesting Worker', 'Planting Worker', 'Farm Equipment Mechanic', 'Dairy Worker',
      'Livestock Worker', 'Poultry Worker', 'Agricultural Equipment Operator',
    ],
  },
  {
    name: 'Pet Services',
    icon: 'heart',
    services: [
      'Dog Walker', 'Pet Sitter', 'Pet Groomer', 'Pet Caretaker', 'Pet Boarding', 'Pet Trainer',
      'Aquarium Maintenance', 'Pet Transport',
    ],
  },
  {
    name: 'Factory & Industrial',
    icon: 'layers',
    services: [
      'Machine Operator', 'CNC Operator', 'Lathe Operator', 'Industrial Electrician',
      'Maintenance Technician', 'Mechanical Technician', 'Production Worker', 'Assembly Worker',
      'Quality Inspector', 'Packaging Worker', 'Industrial Helper',
    ],
  },
  {
    name: 'Electrical, Energy & Specialized',
    icon: 'zap',
    services: [
      'Solar Technician', 'Solar Installation', 'Solar Maintenance', 'Inverter Technician',
      'Battery Technician', 'Generator Technician', 'UPS Technician', 'EV Technician',
      'EV Charger Installation', 'Electrical Panel Technician', 'Wiring Technician',
    ],
  },
  {
    name: 'Security & Safety',
    icon: 'shield',
    services: [
      'Security Guard', 'CCTV Operator', 'Security-System Installer', 'Fire-Safety Technician',
      'Safety Assistant', 'Watchman', 'Gatekeeper',
    ],
  },
  {
    name: 'Drivers & Transportation',
    icon: 'navigation',
    services: [
      'Car Driver', 'Taxi Driver', 'Auto Driver', 'Bike Rider', 'Delivery Rider', 'Truck Driver',
      'Bus Driver', 'Tempo Driver (Transport)', 'Van Driver (Transport)', 'School-Van Driver',
      'Personal Driver', 'Commercial Driver', 'Driver + Helper',
    ],
  },
  {
    name: 'Clothing & Tailoring',
    icon: 'scissors',
    services: [
      'Master Tailor', 'Stitching Worker', 'Alteration Worker', 'Embroidery Worker',
      'Fashion Designer', 'Boutique Worker', 'Textile Worker', 'Ironing Service (Tailoring)',
      'Laundry Worker (Tailoring)', 'Shoe Repair', 'Bag Repair',
    ],
  },
  {
    name: 'Repair & Miscellaneous',
    icon: 'tool',
    services: [
      'Watch Repair', 'Bicycle Repair', 'Umbrella Repair', 'Key Duplication', 'Signboard Repair',
      'Signboard Installation', 'Printing', 'Photocopy', 'Lamination', 'Packaging',
      'Courier Assistance',
    ],
  },
  {
    name: 'Professional Services',
    icon: 'award',
    services: [
      def('Chartered Accountant', { requiresQualification: true, requiresLicense: true }),
      def('Lawyer', { requiresQualification: true, requiresLicense: true }),
      def('Architect', { requiresQualification: true, requiresLicense: true }),
      def('Interior Designer', { requiresQualification: true }),
      def('Engineer', { requiresQualification: true }),
      def('Consultant', { requiresQualification: true }),
      def('Real-Estate Agent', { requiresQualification: true, requiresLicense: true }),
      def('Insurance Agent', { requiresQualification: true, requiresLicense: true }),
      def('Tax Consultant', { requiresQualification: true }),
      def('Financial Consultant', { requiresQualification: true, requiresLicense: true }),
      def('Business Consultant', { requiresQualification: true }),
      def('Surveyor', { requiresQualification: true, requiresLicense: true }),
      def('Draftsman', { requiresQualification: true }),
    ],
  },
];

// A handful of services outside "Professional Services" that also carry
// real verification/licensing weight per the brief's §11.1.3-4 matching
// requirements — flagged explicitly rather than left at the all-false default.
const VERIFICATION_OVERRIDES: Record<string, Partial<ServiceDef>> = {
  Electrician: { requiresVerification: true },
  'Industrial Electrician': { requiresVerification: true },
  'Solar Technician': { requiresVerification: true, requiresQualification: true },
  'EV Technician': { requiresVerification: true, requiresQualification: true },
  'Security Guard': { requiresVerification: true, requiresLicense: true },
  Watchman: { requiresVerification: true },
  'CCTV Operator': { requiresVerification: true },
  'Car Driver': { requiresVerification: true, requiresLicense: true },
  'Taxi Driver': { requiresVerification: true, requiresLicense: true },
  'Truck Driver': { requiresVerification: true, requiresLicense: true },
  'Bus Driver': { requiresVerification: true, requiresLicense: true },
  'Commercial Driver': { requiresVerification: true, requiresLicense: true },
  'School-Van Driver': { requiresVerification: true, requiresLicense: true },
  'Personal Driver': { requiresVerification: true, requiresLicense: true },
  'Elder-Care Assistant': { requiresVerification: true },
  Caregiver: { requiresVerification: true },
  Babysitter: { requiresVerification: true },
  'Nanny / Babysitter': { requiresVerification: true },
  'Home Attendant': { requiresVerification: true },
};

async function run(): Promise<void> {
  connectPg();
  const db = getDb();

  let categoriesUpserted = 0;
  let servicesUpserted = 0;
  const seenServiceSlugs = new Set<string>();
  let servicesSkippedDuplicate = 0;

  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const cat = CATEGORIES[i]!;
    const slug = slugify(cat.name);

    const [catRow] = await db
      .insert(serviceCategories)
      .values({ name: cat.name, slug, icon: cat.icon, sortOrder: i })
      .onConflictDoUpdate({
        target: serviceCategories.slug,
        set: { name: cat.name, icon: cat.icon, sortOrder: i },
      })
      .returning();
    if (!catRow) continue;
    categoriesUpserted += 1;

    for (let j = 0; j < cat.services.length; j += 1) {
      const raw = cat.services[j]!;
      const svcDef: ServiceDef = typeof raw === 'string' ? { name: raw } : raw;
      const overrides = VERIFICATION_OVERRIDES[svcDef.name] ?? {};
      const svcSlug = slugFor(svcDef.name);

      if (seenServiceSlugs.has(svcSlug)) {
        // Same real-world service already inserted under an earlier
        // category (see module doc's Dedup policy) — skip, don't duplicate.
        servicesSkippedDuplicate += 1;
        continue;
      }
      seenServiceSlugs.add(svcSlug);

      const values = {
        categoryId: catRow.id,
        name: svcDef.name,
        slug: svcSlug,
        icon: cat.icon,
        requiresVerification: overrides.requiresVerification ?? svcDef.requiresVerification ?? false,
        requiresQualification: overrides.requiresQualification ?? svcDef.requiresQualification ?? false,
        requiresLicense: overrides.requiresLicense ?? svcDef.requiresLicense ?? false,
        supportsQuickWork: svcDef.supportsQuickWork ?? true,
        supportsScheduledWork: svcDef.supportsScheduledWork ?? true,
        supportsTraditionalJob: svcDef.supportsTraditionalJob ?? true,
        sortOrder: j,
      };

      await db
        .insert(services)
        .values(values)
        .onConflictDoUpdate({ target: services.slug, set: values });
      servicesUpserted += 1;
    }
  }

  logger.info(
    { categoriesUpserted, servicesUpserted, servicesSkippedDuplicate },
    'service catalog seed complete',
  );
  await disconnectPg();
}

run().catch((err) => {
  logger.error({ err }, 'service catalog seed failed');
  process.exit(1);
});

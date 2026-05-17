/**
 * Interview / trial-day prep guides — static content pack.
 *
 * One guide per trade. Each guide answers three questions:
 *   1. Common questions / what to expect
 *   2. What to bring / how to dress
 *   3. How to negotiate pay (light, dignified — no manipulation tactics)
 *
 * Content is intentionally short — five bullets max per section — because
 * the worker may read it on the bus on the way to the interview. We aim
 * for "punchy and dignifying", not exhaustive.
 *
 * Trades are matched against the seeker's skills array; if no match, the
 * generic guide is returned (covers any role).
 */

export interface PrepGuide {
  trade: string;
  /** Friendly label rendered in the UI ("Driver", "Cook"). */
  label: string;
  emoji: string;
  questions: string[];
  bring: string[];
  negotiation: string[];
}

const GENERIC: PrepGuide = {
  trade: 'generic',
  label: 'Any role',
  emoji: '💼',
  questions: [
    'Why do you want this job?',
    'How long have you been doing this kind of work?',
    'Can you start this week?',
    'Have you worked here before, or with anyone they might know?',
    "What's the one thing you're best at?",
  ],
  bring: [
    'Your phone (with Doondo open for your resume)',
    'Aadhaar or any government ID',
    'A pen — for any forms',
    'One small photo if they ask',
    'Clean, weather-appropriate clothes',
  ],
  negotiation: [
    'Know the local rate (see the Local Wage card on Home).',
    "Don't say a number first — let them ask.",
    'If their offer is below the rate, say "the going rate here is X — can you match that?"',
    "It's OK to ask: payment cadence (daily / weekly), overtime, transport.",
    "Walk away politely if they won't meet the floor — there are other employers.",
  ],
};

const GUIDES: PrepGuide[] = [
  {
    trade: 'driver',
    label: 'Driver',
    emoji: '🚗',
    questions: [
      'How long have you been driving?',
      'Which areas of the city do you know well?',
      'What types of vehicles can you drive — manual, automatic, commercial?',
      'Are you comfortable driving at night / on highways?',
      "Can you show me your licence?",
    ],
    bring: [
      'Driving licence (original + photocopy)',
      'Aadhaar card',
      'Recent vehicle commendation (if any)',
      'Clean shoes that grip the pedals',
      'Phone with GPS working',
    ],
    negotiation: [
      'Fuel — confirm who pays. This is the #1 cause of disputes.',
      'Daily kilometres beyond which extra pay applies.',
      'Overtime rate after the agreed daily hours.',
      'Travel allowance if you live far from the garage.',
      'Get the per-day number in writing on Doondo chat.',
    ],
  },
  {
    trade: 'cook',
    label: 'Cook',
    emoji: '🍳',
    questions: [
      'What cuisines can you cook? (North / South / Tiffin / Bakery?)',
      'How many people have you cooked for at once?',
      "What's your specialty dish?",
      'Are you comfortable with vegetarian or non-veg or both?',
      'Can you do a small trial today?',
    ],
    bring: [
      'Health certificate / FSSAI ID if you have one',
      'Aadhaar card',
      'Clean apron (helps make a good first impression)',
      'A small notebook with your standard recipes',
      "If they ask for trial — your own kitchen knife is a nice touch",
    ],
    negotiation: [
      'Confirm: ingredients budget vs. your pay (separate buckets).',
      'Number of meals per day, not just hours — pay is fairer per-meal.',
      "If it's a small canteen, ask about peak-day bonuses.",
      'Free meals during shifts is standard — ask explicitly.',
      'Cleaning duties: confirm whether kitchen cleanup is part of pay.',
    ],
  },
  {
    trade: 'electrician',
    label: 'Electrician',
    emoji: '⚡',
    questions: [
      'What kind of work — residential, commercial, industrial?',
      'Do you have an ITI certificate or licence?',
      'Can you read a basic wiring diagram?',
      'Have you worked on inverters / solar / 3-phase?',
      'How will you handle a customer who insists something dangerous is "fine"?',
    ],
    bring: [
      'ITI / wireman licence (original + copy)',
      'Aadhaar card',
      'Basic tool pouch (tester, plier, screwdriver)',
      'Safety shoes',
      'Phone with calculator app for load math',
    ],
    negotiation: [
      'Per-call vs. day-rate — confirm which model applies.',
      'Travel charge for jobs > 5 km from base.',
      'Material cost — you should never front it from your own pocket.',
      'Emergency / Sunday rates if 24/7 availability is expected.',
      "If they want a guarantee on the work, agree on a fair period — 30 days for normal repairs is industry standard.",
    ],
  },
  {
    trade: 'delivery',
    label: 'Delivery rider',
    emoji: '🛵',
    questions: [
      'Do you own your vehicle or will it be provided?',
      "How do you handle returns and cash-on-delivery?",
      'Are you comfortable using the route app on a phone?',
      'How long is your shift — peak hours?',
      'Have you done food / grocery / parcel delivery before?',
    ],
    bring: [
      'Driving licence',
      'Aadhaar',
      'Two-wheeler papers + insurance (if you bring the bike)',
      'A second helmet if pillion deliveries possible',
      'Phone charger / power bank — long shifts',
    ],
    negotiation: [
      'Per-delivery vs. daily salary — per-delivery is usually fairer at high volume.',
      'Fuel reimbursement at a per-km rate.',
      'Peak-hour bonuses for rush windows.',
      "Insurance — if you ride their bike, who pays in a crash?",
      'Penalty rules — confirm what counts as a "missed" delivery.',
    ],
  },
  {
    trade: 'mason',
    label: 'Mason',
    emoji: '🧱',
    questions: [
      'How many years of construction experience?',
      'Brick / plaster / tile / RCC — which is your specialty?',
      'Have you led a small crew before?',
      "Can you read a basic site drawing?",
      'How will you handle a delay caused by another trade?',
    ],
    bring: [
      'Trowel, level, and plumb-bob if you own them',
      'Aadhaar',
      'Sturdy boots',
      'Sun hat / cap',
      'Water bottle',
    ],
    negotiation: [
      'Day rate vs. piece rate — clarify before you start.',
      'Half-day / full-day cutoffs.',
      'Will materials be on site, or are you expected to fetch?',
      'Weather days — what happens if it rains?',
      'Snack / chai allowance is standard — small but worth asking.',
    ],
  },
  {
    trade: 'helper',
    label: 'Helper',
    emoji: '🤝',
    questions: [
      'Can you lift heavy items safely?',
      'Are you comfortable working alongside multiple trades?',
      'What kind of work have you done before?',
      'Are you OK with cleaning and tidying as part of the role?',
      'Can you start tomorrow?',
    ],
    bring: [
      'Aadhaar',
      'Closed-toe shoes',
      'Gloves if you have them',
      'Phone — they may want to reach you mid-shift',
      'Snack — long days',
    ],
    negotiation: [
      'Day rate is usually fixed, but you can ask for overtime past 8 hours.',
      'Tea / lunch — should be on the employer.',
      'Travel allowance if the site is far from your home.',
      'Confirm whether you get paid for half-days when work runs short.',
      'Ask whether the role can graduate to a skilled trade with time.',
    ],
  },
];

export function findPrepGuide(skills: string[]): PrepGuide {
  for (const s of skills) {
    const key = s.toLowerCase();
    const match = GUIDES.find((g) => key.includes(g.trade));
    if (match) return match;
  }
  return GENERIC;
}

export function allPrepGuides(): PrepGuide[] {
  return [...GUIDES, GENERIC];
}

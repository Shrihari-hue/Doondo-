/**
 * Voice post-draft parser — the pure core of employer Voice Command
 * Posting ("2 dishwashers, Friday night, ₹600").
 *
 * This is the employer-side mirror of the seeker voice agent's
 * `parseVoiceIntent` (see `modules/voiceAgent/intent.ts`). Where that
 * classifier turns a worker's speech into a *search/apply* intent, this
 * one turns an employer's speech into a *draft job post* — a partial
 * `CreateJobBody` the PostJobScreen pre-fills so the employer confirms
 * rather than types. It removes the blank-form barrier that stops a
 * hands-busy, low-literacy employer from posting at all.
 *
 * Everything here is deterministic and synchronous — no I/O, no async,
 * no model calls — exactly like the seeker intent parser. That keeps it
 * unit-testable in the offline bootcheck and makes the extraction
 * predictable and debuggable rather than a black box. The speech itself
 * is turned into text upstream (on-device STT, or the shared
 * transcription service for a raw clip).
 *
 * Multilingual by design: the lexicons carry English, romanised, and
 * native-script terms for the five languages Doondo serves, strongest in
 * English and Hindi (the beta-ready languages). Native-speaker QA will
 * widen the South-Indian synonym sets over time — same trajectory as the
 * seeker lexicon.
 *
 * The parser never throws and never invents a wage it didn't hear: a
 * field it can't extract is simply left absent, and the service reports
 * it under `missing` so the UI can prompt for it. A draft that's only
 * half-understood is still a huge head-start over an empty form.
 */

import { JOB_TYPES, PAY_PERIODS, type JobType, type PayPeriod } from '@/modules/jobs/job.model';

/**
 * A field the parser could not pull from the speech. The service hands
 * this list to the client so PostJobScreen can highlight exactly what
 * still needs the employer's confirmation before publish.
 */
export type DraftMissingField = 'title' | 'wage' | 'jobType' | 'schedule';

/**
 * The structured draft a turn produces. Every field is optional — the
 * parser fills what it heard and leaves the rest for the employer. The
 * shape is intentionally a *subset* of `CreateJobBody` so the mobile can
 * spread it straight into the post-job form state.
 */
export interface JobDraft {
  /** Derived job title, e.g. "Dishwasher" / "Cook". */
  title?: string;
  /** Canonical trade keyword the title came from (drives skills suggest). */
  trade?: string;
  /** How many people to hire — drives the hire-by-headcount flow. Min 1. */
  headcount?: number;
  /** Wage amount in whole rupees. */
  wageAmount?: number;
  /** Pay period the wage attaches to. Defaults sensibly when a wage is heard. */
  wagePeriod?: PayPeriod;
  /** Job type, inferred from shift words ("shift", "gig", "full time"). */
  jobType?: JobType;
  /** Days of week mentioned (0 = Sunday … 6 = Saturday). */
  scheduleDays?: number[];
  /** Start time in 24h "HH:MM" when a clear time/part-of-day was heard. */
  startTime?: string;
  /** True when the employer signalled urgency ("today", "now", "urgent"). */
  urgent?: boolean;
}

export interface ParsedDraft {
  draft: JobDraft;
  /** Fields the parser could not determine — the UI prompts for these. */
  missing: DraftMissingField[];
}

/**
 * Canonical trade → speech synonyms, plus the singular job title the
 * draft should carry. Mirrors the seeker `TRADE_LEXICON` but adds a
 * `title` because the employer is *creating* a posting, not searching.
 * Synonyms are matched as lowercased substrings of the transcript.
 */
const TRADE_LEXICON: ReadonlyArray<{
  trade: string;
  title: string;
  synonyms: readonly string[];
}> = [
  {
    trade: 'dishwasher',
    title: 'Dishwasher',
    synonyms: [
      'dishwasher', 'dish washer', 'dish washing', 'utensil', 'bartan',
      'बर्तन', 'बर्तन धोने', 'डिशवॉशर',
      'பாத்திரம்', 'பாத்திரம் கழுவ',
      'గిన్నెలు', 'పాత్రలు',
      'ಪಾತ್ರೆ', 'ಪಾತ್ರೆ ತೊಳೆ',
    ],
  },
  {
    trade: 'cook',
    title: 'Cook',
    synonyms: [
      'cook', 'cooking', 'chef', 'kitchen', 'rasoi', 'khana', 'bawarchi',
      'रसोइया', 'खाना', 'रसोई', 'बावर्ची', 'कुक',
      'சமையல்', 'சமையற்காரர்',
      'వంట', 'వంటవాడు',
      'ಅಡುಗೆ', 'ಅಡುಗೆಯವರು',
    ],
  },
  {
    trade: 'waiter',
    title: 'Waiter',
    synonyms: [
      'waiter', 'server', 'steward', 'hotel staff',
      'वेटर', 'सर्वर',
      'பணியாளர்', 'வெயிட்டர்',
      'వెయిటర్',
      'ವೇಟರ್',
    ],
  },
  {
    trade: 'driver',
    title: 'Driver',
    synonyms: [
      'driver', 'driving', 'chalak',
      'ड्राइवर', 'चालक', 'गाड़ी',
      'ஓட்டுநர்', 'டிரைவர்',
      'డ్రైవర్', 'డ్రైవింగ్',
      'ಡ್ರೈವರ್', 'ಚಾಲಕ',
    ],
  },
  {
    trade: 'delivery',
    title: 'Delivery Worker',
    synonyms: [
      'delivery', 'courier', 'parcel', 'delivery boy',
      'डिलीवरी', 'डिलिवरी',
      'டெலிவரி',
      'డెలివరీ',
      'ಡೆಲಿವರಿ',
    ],
  },
  {
    trade: 'electrician',
    title: 'Electrician',
    synonyms: [
      'electrician', 'electric', 'wiring', 'bijli',
      'इलेक्ट्रीशियन', 'बिजली',
      'மின்சாரம்', 'எலக்ட்ரீஷியன்',
      'ఎలక్ట్రీషియన్', 'విద్యుత్',
      'ಎಲೆಕ್ಟ್ರಿಷಿಯನ್', 'ವಿದ್ಯುತ್',
    ],
  },
  {
    trade: 'plumber',
    title: 'Plumber',
    synonyms: [
      'plumber', 'plumbing',
      'प्लंबर', 'नल', 'पाइप',
      'பிளம்பர்',
      'ప్లంబర్',
      'ಪ್ಲಂಬರ್',
    ],
  },
  {
    trade: 'helper',
    title: 'Helper',
    synonyms: [
      'helper', 'labour', 'labor', 'mazdoor', 'mazdur',
      'हेल्पर', 'मजदूर', 'मज़दूर',
      'உதவியாளர்', 'ஹெல்பர்',
      'సహాయకుడు', 'హెల్పర్',
      'ಸಹಾಯಕ', 'ಹೆಲ್ಪರ್',
    ],
  },
  {
    trade: 'security',
    title: 'Security Guard',
    synonyms: [
      'security', 'guard', 'watchman', 'chowkidar',
      'सिक्योरिटी', 'गार्ड', 'चौकीदार',
      'காவலாளர்', 'செக்யூரிட்டி',
      'సెక్యూరిటీ', 'గార్డ్',
      'ಸೆಕ್ಯುರಿಟಿ', 'ಕಾವಲುಗಾರ',
    ],
  },
  {
    trade: 'cleaner',
    title: 'Cleaner',
    synonyms: [
      'cleaner', 'cleaning', 'housekeeping', 'safai',
      'सफाई', 'क्लीनर', 'हाउसकीपिंग',
      'சுத்தம்', 'க்ளீனர்',
      'క్లీనర్', 'శుభ్రత',
      'ಕ್ಲೀನರ್', 'ಸ್ವಚ್ಛತೆ',
    ],
  },
  {
    trade: 'mason',
    title: 'Mason',
    synonyms: [
      'mason', 'construction', 'rajmistri',
      'राजमिस्त्री', 'मिस्त्री', 'निर्माण',
      'கொத்தனார்', 'கட்டுமானம்',
      'మేస్త్రి', 'నిర్మాణం',
      'ಕಟ್ಟಡ', 'ಮೇಸ್ತ್ರಿ',
    ],
  },
  {
    trade: 'carpenter',
    title: 'Carpenter',
    synonyms: [
      'carpenter', 'carpentry', 'badhai',
      'कारपेंटर', 'बढ़ई',
      'தச்சர்',
      'వడ్రంగి',
      'ಬಡಗಿ',
    ],
  },
  {
    trade: 'painter',
    title: 'Painter',
    synonyms: [
      'painter', 'painting',
      'पेंटर', 'रंगाई', 'रंग-रोगन',
      'ஓவியர்', 'பெயிண்டர்',
      'పెయింటర్', 'రంగు',
      'ಪೇಂಟರ್', 'ಬಣ್ಣ',
    ],
  },
  {
    trade: 'tailor',
    title: 'Tailor',
    synonyms: [
      'tailor', 'stitching', 'silai', 'darzi',
      'दर्जी', 'सिलाई',
      'தையல்காரர்', 'தையல்',
      'టైలర్', 'కుట్టు',
      'ಟೈಲರ್', 'ಹೊಲಿಗೆ',
    ],
  },
  {
    trade: 'mechanic',
    title: 'Mechanic',
    synonyms: [
      'mechanic', 'garage',
      'मैकेनिक', 'गैराज',
      'மெக்கானிக்', 'கேரேஜ்',
      'మెకానిక్', 'గ్యారేజ్',
      'ಮೆಕ್ಯಾನಿಕ್', 'ಗ್ಯಾರೇಜ್',
    ],
  },
];

/** Number words → value, for "two cooks" / "do log" style headcounts. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, a: 1, an: 1, couple: 2,
  // Hindi
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8,
  // Tamil
  ஒன்று: 1, ஒரு: 1, இரண்டு: 2, ரெண்டு: 2, மூன்று: 3, மூணு: 3, நான்கு: 4, ஐந்து: 5,
  // Telugu
  ఒకటి: 1, ఒక: 1, రెండు: 2, మూడు: 3, నాలుగు: 4, ఐదు: 5,
  // Kannada
  ಒಂದು: 1, ಒಬ್ಬ: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5,
};

/** Day-name synonyms → day index (0 = Sun … 6 = Sat). */
const DAY_LEXICON: ReadonlyArray<{ day: number; synonyms: readonly string[] }> = [
  { day: 0, synonyms: ['sunday', 'sun', 'ravivar', 'रविवार', 'इतवार'] },
  { day: 1, synonyms: ['monday', 'mon', 'somvar', 'सोमवार'] },
  { day: 2, synonyms: ['tuesday', 'tue', 'mangalvar', 'मंगलवार'] },
  { day: 3, synonyms: ['wednesday', 'wed', 'budhvar', 'बुधवार'] },
  { day: 4, synonyms: ['thursday', 'thu', 'guruvar', 'गुरुवार'] },
  { day: 5, synonyms: ['friday', 'fri', 'shukravar', 'शुक्रवार'] },
  { day: 6, synonyms: ['saturday', 'sat', 'shanivar', 'शनिवार'] },
];

/** Part-of-day words → a sensible default 24h start time. */
const PART_OF_DAY: ReadonlyArray<{ start: string; synonyms: readonly string[] }> = [
  { start: '06:00', synonyms: ['morning', 'subah', 'सुबह', 'காலை', 'ఉదయం', 'ಬೆಳಿಗ್ಗೆ'] },
  { start: '12:00', synonyms: ['afternoon', 'dopahar', 'दोपहर', 'மதியம்', 'మధ్యాహ్నం', 'ಮಧ್ಯಾಹ್ನ'] },
  { start: '17:00', synonyms: ['evening', 'shaam', 'शाम', 'மாலை', 'సాయంత్రం', 'ಸಂಜೆ'] },
  { start: '20:00', synonyms: ['night', 'raat', 'रात', 'இரவு', 'రాత్రి', 'ರಾತ್ರಿ'] },
];

/** Words signalling time-sensitivity → sets `urgent` and biases jobType. */
const URGENT_WORDS: readonly string[] = [
  'urgent', 'urgently', 'today', 'right now', 'now', 'immediately', 'asap',
  'turant', 'abhi', 'aaj', 'तुरंत', 'अभी', 'आज', 'जरूरी', 'ज़रूरी',
  'இன்று', 'உடனே', 'ఇవాళ', 'వెంటనే', 'ಇಂದು', 'ತಕ್ಷಣ',
];

/** Period words → PayPeriod. Order matters: check longer phrases first. */
const PERIOD_LEXICON: ReadonlyArray<{ period: PayPeriod; synonyms: readonly string[] }> = [
  { period: 'month', synonyms: ['per month', 'a month', 'monthly', 'mahina', 'महीना', 'महीने', 'मासिक'] },
  { period: 'week', synonyms: ['per week', 'a week', 'weekly', 'hafta', 'हफ्ता', 'हफ्ते', 'साप्ताहिक'] },
  { period: 'hour', synonyms: ['per hour', 'an hour', 'a hour', 'hourly', 'ghanta', 'घंटा', 'घंटे', 'प्रति घंटा'] },
  { period: 'day', synonyms: ['per day', 'a day', 'daily', 'din', 'दिन', 'रोज', 'रोज़', 'दैनिक'] },
];

/** Job-type signal words → JobType. */
const JOBTYPE_LEXICON: ReadonlyArray<{ jobType: JobType; synonyms: readonly string[] }> = [
  { jobType: 'shift', synonyms: ['shift', 'shifts', 'night shift', 'day shift', 'शिफ्ट'] },
  { jobType: 'full_time', synonyms: ['full time', 'full-time', 'fulltime', 'permanent', 'फुल टाइम', 'स्थायी'] },
  { jobType: 'part_time', synonyms: ['part time', 'part-time', 'parttime', 'पार्ट टाइम'] },
  { jobType: 'contract', synonyms: ['contract', 'project', 'ठेका', 'कॉन्ट्रैक्ट'] },
  { jobType: 'gig', synonyms: ['gig', 'one day', 'one-day', 'today only', 'one time', 'दिहाड़ी'] },
];

/** First trade whose synonyms appear in the transcript, or null. */
function matchTrade(lc: string): { trade: string; title: string } | null {
  for (const { trade, title, synonyms } of TRADE_LEXICON) {
    for (const syn of synonyms) {
      if (lc.includes(syn)) return { trade, title };
    }
  }
  return null;
}

/**
 * Extract a wage from the transcript. Recognises a number adjacent to a
 * rupee marker (₹, rs, rupees, "रुपये") OR a number that sits right next
 * to a period word — so "600 per day", "₹600", "rs 600 a day" all land.
 * Returns the amount in whole rupees, or null if no money was heard.
 * Deliberately conservative: a stray "2" (headcount) must not become a
 * ₹2 wage, so a bare number with no rupee/period context is ignored.
 */
function extractWage(lc: string): number | null {
  // ₹600 / rs600 / rs 600 / 600 rupees / 600 रुपये / 600 rupaye (romanised)
  const rupeeMarker =
    /(?:₹|rs\.?|rupees?|rupaye?|rupaiya|रुपये|रुपए|ரூபாய்|రూపాయి|ರೂಪಾಯಿ)\s*([0-9][0-9,]{1,6})|([0-9][0-9,]{1,6})\s*(?:₹|rs\.?|rupees?|rupaye?|rupaiya|रुपये|रुपए|ரூபாய்|రూపాయి|ರೂಪಾಯಿ)/;
  const m = lc.match(rupeeMarker);
  if (m) {
    const raw = (m[1] ?? m[2] ?? '').replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // A number adjacent to a period word, either order: "600 per day",
  // "monthly 18000", "daily 500".
  const periodWords = 'day|hour|week|month|daily|hourly|weekly|monthly|din|ghanta|hafta|mahina|दिन|घंटा|हफ्ता|महीना';
  const numBeforePeriod = new RegExp(`([0-9][0-9,]{1,6})\\s*(?:per\\s+|a\\s+|an\\s+)?(?:${periodWords})`);
  const numAfterPeriod = new RegExp(`(?:${periodWords})\\s*(?:rs\\.?\\s*|₹\\s*)?([0-9][0-9,]{1,6})`);
  const p = lc.match(numBeforePeriod) ?? lc.match(numAfterPeriod);
  if (p?.[1]) {
    const n = Number(p[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Fallback: any standalone number ≥ 100. Local wages are always ≥ 100
  // (a daily wage of ₹200–2000, a monthly of ₹8000–40000), while a
  // headcount is a single digit — so a 3+ digit number is unambiguously
  // money, never a count. This catches a bare "driver 18000" with no
  // marker word at all.
  const bare = lc.match(/(?:^|\s)([1-9][0-9,]{2,6})(?:\s|$)/);
  if (bare?.[1]) {
    const n = Number(bare[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 100) return n;
  }
  return null;
}

/** The pay period named in the transcript, or null when none is clear. */
function extractPeriod(lc: string): PayPeriod | null {
  for (const { period, synonyms } of PERIOD_LEXICON) {
    if (synonyms.some((s) => lc.includes(s))) return period;
  }
  return null;
}

/**
 * Extract a headcount ("2 dishwashers", "do cook", "couple of helpers").
 * Looks for a digit or number-word; ignores a number that is clearly the
 * wage (adjacent to a rupee marker). Returns null when none is found so
 * the draft defaults to hiring one.
 */
function extractHeadcount(lc: string, wage: number | null): number | null {
  // Digit headcount: a small standalone number not glued to a rupee sign.
  const digitMatch = lc.match(/(?:^|\s)([1-9])(?:\s|x)/);
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (n !== wage) return n;
  }
  for (const word of Object.keys(NUMBER_WORDS)) {
    // Word-boundary-ish: the number word followed by a space (so "an" in
    // "an hour" still works but won't run away). Latin words guard with \b.
    const re = /^[a-z]+$/.test(word) ? new RegExp(`\\b${word}\\b`) : new RegExp(word);
    if (re.test(lc)) {
      const n = NUMBER_WORDS[word];
      if (n !== undefined && n !== wage) return n;
    }
  }
  return null;
}

/**
 * Day indices mentioned in the transcript (deduped, ascending). Latin
 * synonyms are matched on word boundaries so a short abbreviation never
 * fires inside a larger word — "monthly" must not match "mon" (Monday),
 * "sunny" must not match "sun". Native-script synonyms match as
 * substrings (no Latin word-boundary semantics apply to them).
 */
function extractDays(lc: string): number[] {
  const found = new Set<number>();
  for (const { day, synonyms } of DAY_LEXICON) {
    for (const syn of synonyms) {
      const hit = /^[a-z]+$/.test(syn)
        ? new RegExp(`\\b${syn}\\b`).test(lc)
        : lc.includes(syn);
      if (hit) {
        found.add(day);
        break;
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** A clean "HH:MM" start time, from an explicit clock time or a part-of-day. */
function extractStartTime(lc: string): string | null {
  // Explicit clock: "9am", "9 am", "9:30 pm", "21:00".
  const clock = lc.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b/);
  if (clock && (clock[3] || clock[2])) {
    let h = Number(clock[1]);
    const min = clock[2] ?? '00';
    const ap = clock[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${min}`;
  }
  for (const { start, synonyms } of PART_OF_DAY) {
    if (synonyms.some((s) => lc.includes(s))) return start;
  }
  return null;
}

/** Job type signalled in the speech, or null. */
function extractJobType(lc: string): JobType | null {
  for (const { jobType, synonyms } of JOBTYPE_LEXICON) {
    if (synonyms.some((s) => lc.includes(s))) return jobType;
  }
  return null;
}

/**
 * Parse one employer utterance into a draft job post.
 *
 * The parser is forgiving: it fills every field it can pull and leaves
 * the rest absent, then reports the absent essentials under `missing`.
 * "Essentials" are the four fields PostJobScreen cannot publish without —
 * title, wage, jobType, schedule — so the confirm screen knows exactly
 * what to ask the employer to fill before the post can go live.
 */
export function parseJobDraft(rawTranscript: string): ParsedDraft {
  const transcript = (rawTranscript ?? '').trim();
  const draft: JobDraft = {};
  if (!transcript) {
    return { draft, missing: ['title', 'wage', 'jobType', 'schedule'] };
  }

  const lc = transcript.toLowerCase();

  // Trade → title + canonical trade keyword.
  const trade = matchTrade(lc);
  if (trade) {
    draft.title = trade.title;
    draft.trade = trade.trade;
  }

  // Wage + period. If a wage is heard with no explicit period, default to
  // per-day — by far the most common framing for Indian local shift work.
  const wage = extractWage(lc);
  if (wage !== null) {
    draft.wageAmount = wage;
    draft.wagePeriod = extractPeriod(lc) ?? 'day';
  } else {
    const periodOnly = extractPeriod(lc);
    if (periodOnly) draft.wagePeriod = periodOnly;
  }

  // Headcount — drives the hire-by-headcount flow downstream.
  const headcount = extractHeadcount(lc, wage);
  if (headcount !== null) draft.headcount = Math.max(1, headcount);

  // Schedule: days + start time.
  const days = extractDays(lc);
  if (days.length > 0) draft.scheduleDays = days;
  const startTime = extractStartTime(lc);
  if (startTime) draft.startTime = startTime;

  // Urgency + job type. Urgency also nudges an unset job type toward gig.
  const urgent = URGENT_WORDS.some((w) => lc.includes(w));
  if (urgent) draft.urgent = true;
  const jobType = extractJobType(lc);
  if (jobType) draft.jobType = jobType;
  else if (urgent) draft.jobType = 'gig';

  // Report the essentials we could not determine.
  const missing: DraftMissingField[] = [];
  if (!draft.title) missing.push('title');
  if (draft.wageAmount === undefined) missing.push('wage');
  if (!draft.jobType) missing.push('jobType');
  if (!draft.scheduleDays && !draft.startTime) missing.push('schedule');

  return { draft, missing };
}

/** Re-exported for the service's typing convenience. */
export { JOB_TYPES, PAY_PERIODS };

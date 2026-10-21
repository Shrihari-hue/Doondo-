/**
 * Push delivery policy — the single gate every Expo push passes through.
 *
 *   1. Category toggles  — `User.notificationPrefs.{jobs,applications,…}`.
 *   2. Quiet hours       — ambient pushes are held back overnight (IST).
 *   3. Localization      — Hindi copy for users whose `locale` is `hi`.
 *
 * The in-app notification row is written by each helper before it pushes,
 * so suppressing a device push never loses the notification itself.
 */

export type PushCategory = 'jobs' | 'applications' | 'messages' | 'ratings' | 'referrals' | 'safety';

/** Category for a payload's `data.type`. Safety pushes ignore toggles. */
export function categoryFor(type: string | undefined): PushCategory {
  const t = type ?? '';
  if (t.startsWith('chat:')) return 'messages';
  if (t.startsWith('sos:') || t.startsWith('trust_circle:')) return 'safety';
  if (t.startsWith('rating:')) return 'ratings';
  if (t.startsWith('referral:')) return 'referrals';
  if (
    t.startsWith('job:') ||
    t.startsWith('job_alert:') ||
    t.startsWith('hired:') ||
    t === 'morning_digest' ||
    t === 'reengagement' ||
    t.startsWith('streak:') ||
    t.startsWith('profile:') ||
    t.startsWith('wage_alert') ||
    t.startsWith('cohort:') ||
    t === 'auction:started'
  ) {
    return 'jobs';
  }
  return 'applications';
}

/** Pushes that must arrive even during quiet hours. */
const URGENT_TYPES = new Set([
  'sos:alert',
  'trust_circle:home_safe',
  'interview:reminder',
  'worker:on_the_way',
  'shift:confirmation',
  'chat:message_received',
]);

export function isUrgent(type: string | undefined): boolean {
  return URGENT_TYPES.has(type ?? '');
}

const IST_OFFSET_MIN = 330;

function toMinutes(hhmm: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/** True when `now` falls inside the user's quiet window (window may wrap midnight). */
export function inQuietHours(
  qh: { enabled?: boolean; start?: string; end?: string } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (qh?.enabled === false) return false;
  const start = toMinutes(qh?.start, 22 * 60);
  const end = toMinutes(qh?.end, 7 * 60);
  if (start === end) return false;
  const ist = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % (24 * 60);
  return start < end ? ist >= start && ist < end : ist >= start || ist < end;
}

/** Employer-side toggles (NotifPreferencesScreen), keyed by push type. */
const EMPLOYER_PREF: Record<string, 'newApplicant' | 'interviewReminder' | 'workerAbsent' | 'payrollDue'> = {
  'application:received': 'newApplicant',
  'open_shift:available': 'newApplicant',
  'interview:reminder': 'interviewReminder',
  'worker:absent': 'workerAbsent',
  'payroll:due': 'payrollDue',
};

export interface RecipientPolicy {
  locale?: string | null;
  notificationPrefs?: {
    newApplicant?: boolean;
    interviewReminder?: boolean;
    workerAbsent?: boolean;
    payrollDue?: boolean;
    jobs?: boolean;
    applications?: boolean;
    messages?: boolean;
    ratings?: boolean;
    referrals?: boolean;
    quietHours?: { enabled?: boolean; start?: string; end?: string };
  } | null;
}

/** Should this push be delivered to the device right now? */
export function shouldDeliver(type: string | undefined, user: RecipientPolicy | undefined, now = new Date()): boolean {
  if (!user) return true;
  const cat = categoryFor(type);
  if (cat !== 'safety' && user.notificationPrefs?.[cat] === false) return false;
  const empKey = EMPLOYER_PREF[type ?? ''];
  if (empKey && user.notificationPrefs?.[empKey] === false) return false;
  // Quiet hours hold back only ambient pushes (suggestions, digests, streaks,
  // ratings, referrals). Offers, hires, messages and safety always arrive.
  const ambient = cat === 'jobs' || cat === 'ratings' || cat === 'referrals';
  if (ambient && !isUrgent(type) && inQuietHours(user.notificationPrefs?.quietHours, now)) return false;
  return true;
}

// ─── Localization ──────────────────────────────────────────────────────────

type Vars = Record<string, unknown>;
type Tpl = (v: Vars) => { title: string; body: string } | null;

const s = (v: unknown) => (v == null ? '' : String(v));

const HI_STATUS: Record<string, string> = {
  viewed: 'देखा गया',
  shortlisted: 'शॉर्टलिस्ट',
  hired: 'नौकरी मिली',
  rejected: 'नहीं चुना गया',
};

/** Hindi templates keyed by `data.type`. Return null to keep English. */
const HI: Record<string, Tpl> = {
  'application:status_changed': (v) => {
    const st = HI_STATUS[s(v.status)] ?? s(v.status);
    return {
      title: s(v.status) === 'hired' ? 'आपको नौकरी मिल गई 🎉' : 'आवेदन अपडेट',
      body: v.jobTitle ? `"${s(v.jobTitle)}" — स्थिति: ${st}` : `आपके आवेदन की स्थिति: ${st}`,
    };
  },
  'interview:scheduled': (v) => ({ title: 'इंटरव्यू तय हुआ', body: v.jobTitle ? `${s(v.jobTitle)} — ऐप में समय देखें` : 'ऐप में समय देखें' }),
  'interview:rescheduled': (v) => ({ title: 'इंटरव्यू का समय बदला', body: v.jobTitle ? `${s(v.jobTitle)} — नया समय देखें` : 'नया समय देखें' }),
  'interview:cancelled': (v) => ({ title: 'इंटरव्यू रद्द', body: v.jobTitle ? `"${s(v.jobTitle)}" का इंटरव्यू रद्द हुआ।` : 'आपका इंटरव्यू रद्द हुआ।' }),
  'interview:reminder': (v) => ({
    title: 'इंटरव्यू जल्द',
    body: `${v.jobTitle ? `${s(v.jobTitle)} — ` : ''}${s(v.minutesUntil)} मिनट में शुरू${v.locationLine ? ` · ${s(v.locationLine)}` : ''}`,
  }),
  'job:new': (v) => ({ title: 'पास में नई नौकरी', body: v.city ? `${s(v.jobTitle)} — ${s(v.city)}` : s(v.jobTitle) }),
  'job_alert:match': (v) => ({ title: `नया मैच — ${s(v.alertName)}`, body: v.city ? `${s(v.jobTitle)} — ${s(v.city)}` : s(v.jobTitle) }),
  'shift:confirmation': (v) => ({ title: 'कल की शिफ्ट कन्फर्म करें', body: `${v.jobTitle ? `${s(v.jobTitle)} — ` : ''}${s(v.whenLabel)}. आ रहे हैं तो टैप करें।` }),
  'offer:made': () => ({ title: 'आपको ऑफर मिला!', body: 'एक मालिक आपको काम पर रखना चाहता है। समय रहते स्वीकार करें।' }),
  'application:skill_gap': (v) => ({
    title: v.jobTitle ? `"${s(v.jobTitle)}" पर अपडेट` : 'आवेदन अपडेट',
    body: `कमी: ${s(v.missingSkill)}। ${s(v.courseTitle)} (${s(v.durationMinutes)} मिनट) से यह सीखें।`,
  }),
  'application:ghosted': (v) => ({
    title: 'अभी तक जवाब नहीं',
    body: `${s(v.employerName) || 'मालिक'} ने ${s(v.hours)} घंटे से जवाब नहीं दिया।`,
  }),
  morning_digest: () => ({ title: 'आपकी सुबह की खबर', body: 'आज की नई नौकरियाँ और अपडेट देखें।' }),
  reengagement: () => ({ title: 'नई नौकरियाँ आपका इंतज़ार कर रही हैं', body: 'Doondo खोलें और आज की नौकरियाँ देखें।' }),
  'streak:milestone': (v) => ({ title: `${s(v.days)} दिन की लगातार मेहनत 🔥`, body: `शाबाश — लगातार ${s(v.days)} दिन!` }),
  'referral:bonus': (v) => ({ title: 'रेफ़रल बोनस मिला', body: `${s(v.refereeName)} को आपके शेयर से नौकरी मिली। बोनस वॉलेट में जमा।` }),
  'hired:nearby': (v) => ({ title: 'पास में किसी को नौकरी मिली', body: `${s(v.hiredFirstName)} को अभी ${s(v.jobTitle)} की नौकरी मिली${v.area ? ` — ${s(v.area)}` : ''}।` }),
  'rating:received': (v) => ({ title: 'आपको नई रेटिंग मिली', body: `${s(v.reviewerName)} ने आपको ${s(v.score)}/5 दिया${v.jobTitle ? ` — "${s(v.jobTitle)}"` : ''}` }),
  'hire:celebration': (v) => ({
    title: v.jobTitle ? `आपको ${s(v.jobTitle)} की नौकरी मिली` : 'आपको नौकरी मिल गई',
    body: v.employerName ? `${s(v.employerName)} ने आपको चुना। आगे क्या करना है, Doondo में देखें।` : 'आगे क्या करना है, Doondo में देखें।',
  }),
  'profile:viewed': (v) => ({ title: 'किसी ने आपकी प्रोफ़ाइल देखी', body: `${s(v.viewerName)} ने अभी आपकी प्रोफ़ाइल देखी।` }),
  'crew:shift': (v) => ({ title: 'शिफ्ट पहले आपके लिए', body: v.jobTitle ? `"${s(v.jobTitle)}" — सबसे पहले आपको मौका।` : 'नई शिफ्ट — सबसे पहले आपको मौका।' }),
  task_assigned: (v) => ({ title: 'नया काम', body: `${s(v.employerName)}: ${s(v.taskTitle)}`.slice(0, 160) }),
  'trust_circle:home_safe': (v) => ({ title: 'सुरक्षित घर पहुँचे', body: `${s(v.workerFirstName)} सुरक्षित घर पहुँच गए।` }),
  'application:received': (v) => ({ title: 'नया आवेदन', body: `${s(v.applicantName)} ने "${s(v.jobTitle)}" के लिए आवेदन किया।` }),
  'worker:absent': (v) => ({ title: 'कर्मचारी ने चेक-इन नहीं किया', body: `${s(v.workerName)} ने "${s(v.jobTitle)}" के लिए अभी तक चेक-इन नहीं किया (शिफ्ट ${s(v.startTime)} बजे शुरू)।` }),
  'payroll:due': (v) => ({ title: 'वेतन देने का दिन', body: `आज महीने का आख़िरी दिन है — ${s(v.workerCount)} कर्मचारियों को भुगतान करना है।` }),
  'open_shift:available': (v) => ({ title: 'कारीगर अभी उपलब्ध', body: `${s(v.workerFirstName)} ${v.area ? `${s(v.area)} में ` : 'पास में '}खाली हैं${v.dailyRateRupees ? ` · ₹${s(v.dailyRateRupees)}/दिन` : ''}। बुलाने के लिए टैप करें।` }),
  'wage_alert:low': (v) => ({ title: 'कम मज़दूरी की चेतावनी', body: s(v.bodyHi) || s(v.body) }),
};

/** Localized title/body for a payload, or null to keep the original English copy. */
export function localize(
  type: string | undefined,
  locale: string | null | undefined,
  vars: Vars | undefined,
): { title: string; body: string } | null {
  if (!type || !vars || (locale ?? 'en').slice(0, 2) !== 'hi') return null;
  const tpl = HI[type];
  if (!tpl) return null;
  try {
    return tpl(vars);
  } catch {
    return null;
  }
}

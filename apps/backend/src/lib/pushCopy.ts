/**
 * Push notification copy, localized into the app's 5 supported languages.
 *
 * Push composition happens server-side (Node), which has no access to
 * the mobile app's i18next runtime, and there's no shared i18n package
 * between apps/backend and apps/mobile (only @doondo/tokens is shared —
 * see packages/). So this is a backend-side sibling catalogue, same key
 * → per-locale-string shape and `{{var}}` interpolation as
 * apps/mobile/src/i18n/locales/*.json, rather than a literal import of
 * those files.
 *
 * Deliberately NOT wired through the live translation module
 * (modules/translation) — that's built for freeform chat text via an
 * LLM call per message, which is the wrong tool for a small, fixed set
 * of system-generated templates: an LLM round-trip per push (often
 * fanned out to hundreds of recipients) would be slow, costly, and
 * adds a failure mode a static dictionary doesn't have.
 *
 * Scope: covers the push kinds push.ts fully owns the copy for. NOT
 * covered (and left English-only, a known follow-up — see
 * DOONDO_PUSH_NOTIFICATIONS_STATUS.md): (1) chat message previews —
 * that's the sender's freeform text, already handled by the separate
 * in-chat auto-translate feature, not something a static dictionary
 * should touch; (2) morning digest / re-engagement bodies — composed
 * by their own services (digest.service.ts, reengagement.service.ts)
 * as already-assembled strings, not templates push.ts owns; (3) the
 * lower-traffic employer-operational pushes (offers, crew shifts,
 * shift check-ins, trust circle, home-safe, profile-viewed, open
 * shift) — narrower audience, queued for a follow-up pass.
 *
 * Hindi is a careful best-effort. Tamil / Telugu / Kannada are
 * best-effort machine translations and — like every other South-Indian
 * string in this app — should get a native-speaker QA pass before
 * launch; see the translation QA sheet extracted alongside this work.
 */

export const PUSH_LOCALES = ['en', 'hi', 'ta', 'te', 'kn'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

export function isPushLocale(v: unknown): v is PushLocale {
  return typeof v === 'string' && (PUSH_LOCALES as readonly string[]).includes(v);
}

/** BCP-47 tag for locale-aware date formatting (mirrors the mobile voice agent's speechLang map). */
export const PUSH_LOCALE_BCP47: Record<PushLocale, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
};

type Row = Record<PushLocale, string>;

function interp(tpl: string, params?: Record<string, string | number>): string {
  if (!params) return tpl;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(params[k] ?? ''));
}

const DICT: Record<string, Row> = {
  // ─── application status ─────────────────────────────────────────────────
  'app_status.title.viewed': { en: 'Your application was viewed', hi: 'आपका आवेदन देखा गया', ta: 'உங்கள் விண்ணப்பம் பார்க்கப்பட்டது', te: 'మీ దరఖాస్తు వీక్షించబడింది', kn: 'ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ವೀಕ್ಷಿಸಲಾಗಿದೆ' },
  'app_status.title.shortlisted': { en: 'You were shortlisted', hi: 'आपको शॉर्टलिस्ट किया गया', ta: 'நீங்கள் தேர்ந்தெடுக்கப்பட்டீர்கள்', te: 'మిమ్మల్ని షార్ట్‌లిస్ట్ చేశారు', kn: 'ನಿಮ್ಮನ್ನು ಶಾರ್ಟ್‌ಲಿಸ್ಟ್ ಮಾಡಲಾಗಿದೆ' },
  'app_status.title.hired': { en: 'You got the job', hi: 'आपको नौकरी मिल गई', ta: 'உங்களுக்கு வேலை கிடைத்தது', te: 'మీకు ఉద్యోగం వచ్చింది', kn: 'ನಿಮಗೆ ಕೆಲಸ ಸಿಕ್ಕಿದೆ' },
  'app_status.title.rejected': { en: 'Application update', hi: 'आवेदन अपडेट', ta: 'விண்ணப்ப புதுப்பிப்பு', te: 'దరఖాస్తు నవీకరణ', kn: 'ಅರ್ಜಿ ನವೀಕರಣ' },
  'app_status.body.with_job': { en: 'On "{{job}}".', hi: '"{{job}}" के लिए।', ta: '"{{job}}" பணிக்கு.', te: '"{{job}}" ఉద్యోగం కోసం.', kn: '"{{job}}" ಕೆಲಸಕ್ಕಾಗಿ.' },
  'app_status.body.without_job': { en: 'Your status has changed.', hi: 'आपकी स्थिति बदल गई है।', ta: 'உங்கள் நிலை மாறியுள்ளது.', te: 'మీ స్థితి మారింది.', kn: 'ನಿಮ್ಮ ಸ್ಥಿತಿ ಬದಲಾಗಿದೆ.' },

  // ─── interview ───────────────────────────────────────────────────────────
  'interview.title.scheduled': { en: 'Interview scheduled', hi: 'साक्षात्कार निर्धारित', ta: 'நேர்காணல் திட்டமிடப்பட்டது', te: 'ఇంటర్వ్యూ షెడ్యూల్ చేయబడింది', kn: 'ಸಂದರ್ಶನ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ' },
  'interview.title.rescheduled': { en: 'Interview rescheduled', hi: 'साक्षात्कार पुनर्निर्धारित', ta: 'நேர்காணல் மறுஅட்டவணை', te: 'ఇంటర్వ్యూ రీషెడ్యూల్ చేయబడింది', kn: 'ಸಂದರ್ಶನ ಮರುನಿಗದಿಪಡಿಸಲಾಗಿದೆ' },
  'interview.title.cancelled': { en: 'Interview cancelled', hi: 'साक्षात्कार रद्द', ta: 'நேர்காணல் ரத்து செய்யப்பட்டது', te: 'ఇంటర్వ్యూ రద్దు చేయబడింది', kn: 'ಸಂದರ್ಶನ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ' },
  'interview.body.cancelled_with_job': { en: 'Your interview for "{{job}}" was cancelled.', hi: '"{{job}}" के लिए आपका साक्षात्कार रद्द कर दिया गया।', ta: '"{{job}}" க்கான உங்கள் நேர்காணல் ரத்து செய்யப்பட்டது.', te: '"{{job}}" కోసం మీ ఇంటర్వ్యూ రద్దు చేయబడింది.', kn: '"{{job}}" ಗಾಗಿ ನಿಮ್ಮ ಸಂದರ್ಶನ ರದ್ದುಗೊಂಡಿದೆ.' },
  'interview.body.cancelled_without_job': { en: 'Your interview was cancelled.', hi: 'आपका साक्षात्कार रद्द कर दिया गया।', ta: 'உங்கள் நேர்காணல் ரத்து செய்யப்பட்டது.', te: 'మీ ఇంటర్వ్యూ రద్దు చేయబడింది.', kn: 'ನಿಮ್ಮ ಸಂದರ್ಶನ ರದ್ದುಗೊಂಡಿದೆ.' },
  'interview.body.when_with_job': { en: '{{job}} — {{when}}', hi: '{{job}} — {{when}}', ta: '{{job}} — {{when}}', te: '{{job}} — {{when}}', kn: '{{job}} — {{when}}' },
  'interview.body.when_without_job': { en: 'Interview {{when}}', hi: 'साक्षात्कार {{when}}', ta: 'நேர்காணல் {{when}}', te: 'ఇంటర్వ్యూ {{when}}', kn: 'ಸಂದರ್ಶನ {{when}}' },
  'interview.body.no_when': { en: 'Open Doondo for details.', hi: 'विवरण के लिए Doondo खोलें।', ta: 'விவரங்களுக்கு Doondo-வைத் திறக்கவும்.', te: 'వివరాల కోసం Doondo తెరవండి.', kn: 'ವಿವರಗಳಿಗಾಗಿ Doondo ತೆರೆಯಿರಿ.' },

  // ─── skill gap ───────────────────────────────────────────────────────────
  'skill_gap.title.with_job': { en: 'Update on "{{job}}"', hi: '"{{job}}" पर अपडेट', ta: '"{{job}}" குறித்த புதுப்பிப்பு', te: '"{{job}}" పై నవీకరణ', kn: '"{{job}}" ಕುರಿತು ನವೀಕರಣ' },
  'skill_gap.title.without_job': { en: 'Application update', hi: 'आवेदन अपडेट', ta: 'விண்ணப்ப புதுப்பிப்பு', te: 'దరఖాస్తు నవీకరణ', kn: 'ಅರ್ಜಿ ನವೀಕರಣ' },
  'skill_gap.body': { en: 'Missing: {{skill}}. {{course}} ({{minutes}} min) can close the gap.', hi: 'कमी: {{skill}}। {{course}} ({{minutes}} मिनट) यह अंतर पूरा कर सकता है।', ta: 'குறை: {{skill}}. {{course}} ({{minutes}} நிமிடம்) இந்த இடைவெளியை நிரப்பும்.', te: 'లోపం: {{skill}}. {{course}} ({{minutes}} నిమిషాలు) ఈ అంతరాన్ని పూరించగలదు.', kn: 'ಕೊರತೆ: {{skill}}. {{course}} ({{minutes}} ನಿಮಿಷ) ಈ ಅಂತರವನ್ನು ತುಂಬಬಹುದು.' },

  // ─── ghosted ──────────────────────────────────────────────────────────────
  'ghosted.title': { en: 'No reply yet', hi: 'अभी तक कोई जवाब नहीं', ta: 'இன்னும் பதில் இல்லை', te: 'ఇంకా సమాధానం లేదు', kn: 'ಇನ್ನೂ ಪ್ರತ್ಯುತ್ತರವಿಲ್ಲ' },
  'ghosted.default_employer': { en: 'The employer', hi: 'नियोक्ता', ta: 'முதலாளி', te: 'యజమాని', kn: 'ಉದ್ಯೋಗದಾತ' },
  'ghosted.body.with_job': { en: '{{employer}} hasn\'t replied to your "{{job}}" application in {{hours}} hours.', hi: '{{employer}} ने {{hours}} घंटों में आपके "{{job}}" आवेदन का जवाब नहीं दिया।', ta: '{{employer}} {{hours}} மணி நேரமாக உங்கள் "{{job}}" விண்ணப்பத்திற்கு பதிலளிக்கவில்லை.', te: '{{employer}} {{hours}} గంటల్లో మీ "{{job}}" దరఖాస్తుకు స్పందించలేదు.', kn: '{{employer}} {{hours}} ಗಂಟೆಗಳಲ್ಲಿ ನಿಮ್ಮ "{{job}}" ಅರ್ಜಿಗೆ ಪ್ರತಿಕ್ರಿಯಿಸಿಲ್ಲ.' },
  'ghosted.body.without_job': { en: "{{employer}} hasn't replied in {{hours}} hours.", hi: '{{employer}} ने {{hours}} घंटों में जवाब नहीं दिया।', ta: '{{employer}} {{hours}} மணி நேரமாக பதிலளிக்கவில்லை.', te: '{{employer}} {{hours}} గంటల్లో స్పందించలేదు.', kn: '{{employer}} {{hours}} ಗಂಟೆಗಳಲ್ಲಿ ಪ್ರತಿಕ್ರಿಯಿಸಿಲ್ಲ.' },

  // ─── streak milestone ────────────────────────────────────────────────────
  'streak.kind.apply': { en: 'apply', hi: 'आवेदन', ta: 'விண்ணப்பம்', te: 'దరఖాస్తు', kn: 'ಅರ್ಜಿ' },
  'streak.kind.course': { en: 'course', hi: 'कोर्स', ta: 'பாடநெறி', te: 'కోర్సు', kn: 'ಕೋರ್ಸ್' },
  'streak.kind.shift': { en: 'shift', hi: 'शिफ्ट', ta: 'ஷிப்ட்', te: 'షిఫ్ట్', kn: 'ಶಿಫ್ಟ್' },
  'streak.verb.apply': { en: 'applying', hi: 'आवेदन करने', ta: 'விண்ணப்பிப்பதில்', te: 'దరఖాస్తు చేయడంలో', kn: 'ಅರ್ಜಿ ಸಲ್ಲಿಸುವಲ್ಲಿ' },
  'streak.verb.course': { en: 'learning', hi: 'सीखने', ta: 'கற்பதில்', te: 'నేర్చుకోవడంలో', kn: 'ಕಲಿಯುವಲ್ಲಿ' },
  'streak.verb.shift': { en: 'showing up', hi: 'शिफ्ट पर आने', ta: 'வேலைக்கு வருவதில்', te: 'హాజరవ్వడంలో', kn: 'ಹಾಜರಾಗುವಲ್ಲಿ' },
  'streak.title': { en: '{{days}}-day {{kind}} streak 🔥', hi: '{{days}}-दिन की {{kind}} लकीर 🔥', ta: '{{days}}-நாள் {{kind}} தொடர்ச்சி 🔥', te: '{{days}}-రోజుల {{kind}} స్ట్రీక్ 🔥', kn: '{{days}}-ದಿನದ {{kind}} ಸ್ಟ್ರೀಕ್ 🔥' },
  'streak.body': { en: 'Nice work — {{days}} days of {{verb}} in a row.', hi: 'बढ़िया — लगातार {{days}} दिनों से {{verb}}।', ta: 'அருமை — தொடர்ந்து {{days}} நாட்களாக {{verb}}.', te: 'బాగుంది — వరుసగా {{days}} రోజులు {{verb}}.', kn: 'ಚೆನ್ನಾಗಿದೆ — ಸತತ {{days}} ದಿನ {{verb}}.' },

  // ─── referral bonus ──────────────────────────────────────────────────────
  'referral.title': { en: '+₹{{amount}} referral bonus', hi: '+₹{{amount}} रेफरल बोनस', ta: '+₹{{amount}} பரிந்துரை போனஸ்', te: '+₹{{amount}} రిఫరల్ బోనస్', kn: '+₹{{amount}} ರೆಫರಲ್ ಬೋನಸ್' },
  'referral.body': { en: '{{name}} got hired through your share. Bonus credited to your wallet.', hi: '{{name}} को आपके शेयर से नौकरी मिली। बोनस आपके वॉलेट में जमा हो गया।', ta: 'உங்கள் பகிர்வு மூலம் {{name}} க்கு வேலை கிடைத்தது. போனஸ் உங்கள் வாலட்டில் வரவு வைக்கப்பட்டது.', te: 'మీ షేర్ ద్వారా {{name}} కి ఉద్యోగం వచ్చింది. బోనస్ మీ వాలెట్‌కు జమ చేయబడింది.', kn: 'ನಿಮ್ಮ ಶೇರ್ ಮೂಲಕ {{name}} ಗೆ ಕೆಲಸ ಸಿಕ್ಕಿದೆ. ಬೋನಸ್ ನಿಮ್ಮ ವಾಲೆಟ್‌ಗೆ ಜಮೆಯಾಗಿದೆ.' },

  // ─── hired nearby ────────────────────────────────────────────────────────
  'hired_nearby.title': { en: 'Hired near you', hi: 'आपके पास किसी को नौकरी मिली', ta: 'உங்களுக்கு அருகில் வேலை கிடைத்தது', te: 'మీ దగ్గర ఉద్యోగం వచ్చింది', kn: 'ನಿಮ್ಮ ಹತ್ತಿರ ಕೆಲಸ ಸಿಕ್ಕಿದೆ' },
  'hired_nearby.body.with_area': { en: '{{name}} was just hired as {{job}} in {{area}}.', hi: '{{name}} को अभी {{area}} में {{job}} के रूप में नौकरी मिली।', ta: '{{name}} சற்றுமுன் {{area}}-ல் {{job}} ஆக பணிக்கு அமர்த்தப்பட்டார்.', te: '{{name}} ఇప్పుడే {{area}}లో {{job}}గా నియమించబడ్డారు.', kn: '{{name}} ಈಗಷ್ಟೇ {{area}}ನಲ್ಲಿ {{job}} ಆಗಿ ನೇಮಕಗೊಂಡಿದ್ದಾರೆ.' },
  'hired_nearby.body.without_area': { en: '{{name}} was just hired as {{job}} nearby.', hi: '{{name}} को अभी पास में {{job}} के रूप में नौकरी मिली।', ta: '{{name}} சற்றுமுன் அருகில் {{job}} ஆக பணிக்கு அமர்த்தப்பட்டார்.', te: '{{name}} ఇప్పుడే దగ్గర్లో {{job}}గా నియమించబడ్డారు.', kn: '{{name}} ಈಗಷ್ಟೇ ಹತ್ತಿರದಲ್ಲಿ {{job}} ಆಗಿ ನೇಮಕಗೊಂಡಿದ್ದಾರೆ.' },

  // ─── rating received ─────────────────────────────────────────────────────
  'rating.title': { en: 'You got a new rating', hi: 'आपको एक नई रेटिंग मिली', ta: 'உங்களுக்கு புதிய மதிப்பீடு கிடைத்தது', te: 'మీకు కొత్త రేటింగ్ వచ్చింది', kn: 'ನಿಮಗೆ ಹೊಸ ರೇಟಿಂಗ್ ಸಿಕ್ಕಿದೆ' },
  'rating.body.with_job': { en: '{{name}} rated you {{score}}/5 for "{{job}}"', hi: '{{name}} ने "{{job}}" के लिए आपको {{score}}/5 रेटिंग दी', ta: '"{{job}}" க்காக {{name}} உங்களுக்கு {{score}}/5 மதிப்பீடு அளித்தார்', te: '"{{job}}" కోసం {{name}} మీకు {{score}}/5 రేటింగ్ ఇచ్చారు', kn: '"{{job}}" ಗಾಗಿ {{name}} ನಿಮಗೆ {{score}}/5 ರೇಟಿಂಗ್ ನೀಡಿದ್ದಾರೆ' },
  'rating.body.without_job': { en: '{{name}} rated you {{score}}/5', hi: '{{name}} ने आपको {{score}}/5 रेटिंग दी', ta: '{{name}} உங்களுக்கு {{score}}/5 மதிப்பீடு அளித்தார்', te: '{{name}} మీకు {{score}}/5 రేటింగ్ ఇచ్చారు', kn: '{{name}} ನಿಮಗೆ {{score}}/5 ರೇಟಿಂಗ್ ನೀಡಿದ್ದಾರೆ' },

  // ─── hire celebration ────────────────────────────────────────────────────
  'hire_celebration.title.with_job': { en: 'You got hired as {{job}}', hi: 'आपको {{job}} के रूप में नौकरी मिली', ta: 'நீங்கள் {{job}} ஆக பணிக்கு அமர்த்தப்பட்டீர்கள்', te: 'మీరు {{job}}గా నియమించబడ్డారు', kn: 'ನೀವು {{job}} ಆಗಿ ನೇಮಕಗೊಂಡಿದ್ದೀರಿ' },
  'hire_celebration.title.without_job': { en: 'You got hired', hi: 'आपको नौकरी मिल गई', ta: 'உங்களுக்கு வேலை கிடைத்தது', te: 'మీకు ఉద్యోగం వచ్చింది', kn: 'ನಿಮಗೆ ಕೆಲಸ ಸಿಕ್ಕಿದೆ' },
  'hire_celebration.body.with_employer': { en: '{{employer}} picked you. Open Doondo for the next steps.', hi: '{{employer}} ने आपको चुना। अगले कदम के लिए Doondo खोलें।', ta: '{{employer}} உங்களைத் தேர்ந்தெடுத்தார். அடுத்த படிகளுக்கு Doondo-வைத் திறக்கவும்.', te: '{{employer}} మిమ్మల్ని ఎంచుకున్నారు. తదుపరి దశల కోసం Doondo తెరవండి.', kn: '{{employer}} ನಿಮ್ಮನ್ನು ಆಯ್ಕೆ ಮಾಡಿದ್ದಾರೆ. ಮುಂದಿನ ಹಂತಗಳಿಗಾಗಿ Doondo ತೆರೆಯಿರಿ.' },
  'hire_celebration.body.without_employer': { en: 'Open Doondo for the next steps.', hi: 'अगले कदम के लिए Doondo खोलें।', ta: 'அடுத்த படிகளுக்கு Doondo-வைத் திறக்கவும்.', te: 'తదుపరి దశల కోసం Doondo తెరవండి.', kn: 'ಮುಂದಿನ ಹಂತಗಳಿಗಾಗಿ Doondo ತೆರೆಯಿರಿ.' },

  // ─── SOS ─────────────────────────────────────────────────────────────────
  'sos.title': { en: '🚨 SOS — needs help', hi: '🚨 SOS — मदद चाहिए', ta: '🚨 SOS — உதவி தேவை', te: '🚨 SOS — సహాయం అవసరం', kn: '🚨 SOS — ಸಹಾಯ ಬೇಕು' },
  'sos.relationship.family': { en: 'family', hi: 'परिवार', ta: 'குடும்பம்', te: 'కుటుంబం', kn: 'ಕುಟುಂಬ' },
  'sos.relationship.friend': { en: 'friend', hi: 'दोस्त', ta: 'நண்பர்', te: 'స్నేహితుడు', kn: 'ಸ್ನೇಹಿತ' },
  'sos.relationship.employer': { en: 'employer', hi: 'नियोक्ता', ta: 'முதலாளி', te: 'యజమాని', kn: 'ಉದ್ಯೋಗದಾತ' },
  'sos.relationship.peer': { en: 'peer', hi: 'साथी', ta: 'சக ஊழியர்', te: 'తోటి కార్మికుడు', kn: 'ಸಹೋದ್ಯೋಗಿ' },
  'sos.body.with_location': { en: '{{name}} ({{relationship}}) triggered SOS. Location: {{link}}', hi: '{{name}} ({{relationship}}) ने SOS भेजा। स्थान: {{link}}', ta: '{{name}} ({{relationship}}) SOS அனுப்பினார். இருப்பிடம்: {{link}}', te: '{{name}} ({{relationship}}) SOS పంపారు. స్థానం: {{link}}', kn: '{{name}} ({{relationship}}) SOS ಕಳುಹಿಸಿದ್ದಾರೆ. ಸ್ಥಳ: {{link}}' },
  'sos.body.without_location': { en: '{{name}} ({{relationship}}) triggered SOS. Location unavailable — please call.', hi: '{{name}} ({{relationship}}) ने SOS भेजा। स्थान उपलब्ध नहीं — कृपया कॉल करें।', ta: '{{name}} ({{relationship}}) SOS அனுப்பினார். இருப்பிடம் இல்லை — தயவுசெய்து அழைக்கவும்.', te: '{{name}} ({{relationship}}) SOS పంపారు. స్థానం అందుబాటులో లేదు — దయచేసి కాల్ చేయండి.', kn: '{{name}} ({{relationship}}) SOS ಕಳುಹಿಸಿದ್ದಾರೆ. ಸ್ಥಳ ಲಭ್ಯವಿಲ್ಲ — ದಯವಿಟ್ಟು ಕರೆ ಮಾಡಿ.' },

  // ─── mentor session ──────────────────────────────────────────────────────
  'mentor_session.title.booked': { en: 'Mentor session booked', hi: 'मेंटर सेशन बुक हुआ', ta: 'மென்டார் அமர்வு பதிவு செய்யப்பட்டது', te: 'మెంటార్ సెషన్ బుక్ చేయబడింది', kn: 'ಮೆಂಟರ್ ಸೆಷನ್ ಬುಕ್ ಆಗಿದೆ' },
  'mentor_session.title.cancelled': { en: 'Mentor session cancelled', hi: 'मेंटर सेशन रद्द', ta: 'மென்டார் அமர்வு ரத்து', te: 'మెంటార్ సెషన్ రద్దు', kn: 'ಮೆಂಟರ್ ಸೆಷನ್ ರದ್ದಾಗಿದೆ' },
  'mentor_session.body.booked': { en: '{{name}} booked your session — {{when}}.', hi: '{{name}} ने आपका सेशन बुक किया — {{when}}।', ta: '{{name}} உங்கள் அமர்வை பதிவு செய்தார் — {{when}}.', te: '{{name}} మీ సెషన్‌ను బుక్ చేశారు — {{when}}.', kn: '{{name}} ನಿಮ್ಮ ಸೆಷನ್ ಬುಕ್ ಮಾಡಿದ್ದಾರೆ — {{when}}.' },
  'mentor_session.body.cancelled': { en: '{{name}} cancelled the session for {{when}}.', hi: '{{name}} ने {{when}} का सेशन रद्द किया।', ta: '{{name}} {{when}} அமர்வை ரத்து செய்தார்.', te: '{{name}} {{when}} సెషన్‌ను రద్దు చేశారు.', kn: '{{name}} {{when}} ಸೆಷನ್ ಅನ್ನು ರದ್ದುಗೊಳಿಸಿದ್ದಾರೆ.' },

  // ─── cohorts (#7) ────────────────────────────────────────────────────────
  'cohort_invite.title': { en: 'Cohort invite', hi: 'कोहॉर्ट आमंत्रण', ta: 'கூட்டு அழைப்பு', te: 'కోహోర్ట్ ఆహ్వానం', kn: 'ಕೊಹಾರ್ಟ್ ಆಹ್ವಾನ' },
  'cohort_invite.body': { en: '{{name}} invited you to a "{{course}}" cohort.', hi: '{{name}} ने आपको "{{course}}" कोहॉर्ट में आमंत्रित किया।', ta: '{{name}} உங்களை "{{course}}" கூட்டுக்கு அழைத்தார்.', te: '{{name}} మిమ్మల్ని "{{course}}" కోహోర్ట్‌కి ఆహ్వానించారు.', kn: '{{name}} ನಿಮ್ಮನ್ನು "{{course}}" ಕೊಹಾರ್ಟ್‌ಗೆ ಆಹ್ವಾನಿಸಿದ್ದಾರೆ.' },

  // ─── new job fan-out ─────────────────────────────────────────────────────
  'new_job.title': { en: 'New job near you', hi: 'आपके पास नई नौकरी', ta: 'உங்களுக்கு அருகில் புதிய வேலை', te: 'మీ దగ్గర కొత్త ఉద్యోగం', kn: 'ನಿಮ್ಮ ಹತ್ತಿರ ಹೊಸ ಕೆಲಸ' },
};

/** Look up one localized string, falling back to English if the key or locale is missing. */
export function pushText(key: string, locale: PushLocale | null | undefined, params?: Record<string, string | number>): string {
  const row = DICT[key];
  if (!row) return '';
  const tpl = row[locale ?? 'en'] ?? row.en;
  return interp(tpl, params);
}

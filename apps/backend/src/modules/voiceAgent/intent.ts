/**
 * Voice intent parser — the pure core of the voice job-search agent.
 *
 * Takes one line of recognised speech (already turned into text by the
 * speech-to-text layer) and classifies it into a structured intent the
 * agent service can act on:
 *
 *   search  — "I need cook jobs near me"   → look up jobs
 *   apply   — "apply to the second one"    → apply to a result
 *   repeat  — "say that again"             → re-read the last reply
 *   help    — "what can I say?"            → explain the agent
 *   unknown — nothing was heard at all
 *
 * Everything here is deterministic and synchronous — no I/O, no async,
 * no model calls. That is deliberate: it makes the whole classifier
 * unit-testable in the offline bootcheck, and it means the agent's
 * behaviour is predictable and debuggable rather than a black box.
 *
 * Multilingual by design: a blue-collar worker speaks in their own
 * language, so the keyword lists carry English, romanised, and native-
 * script terms for the five languages Doondo serves. The lexicon is
 * strongest in English and Hindi (the beta-ready languages) and has
 * solid coverage for Tamil, Telugu and Kannada; native-speaker QA will
 * widen the South-Indian synonym sets over time.
 */

export type VoiceIntentKind =
  | 'search'
  | 'apply'
  | 'repeat'
  | 'help'
  | 'interviews'
  | 'messages'
  | 'unknown';

export interface VoiceIntent {
  kind: VoiceIntentKind;
  /**
   * Present when `kind === 'search'`. A canonical trade keyword
   * ('cook', 'driver', …) handed to the job search, or an empty string
   * for a generic "jobs near me" search when no trade was recognised.
   */
  query?: string;
  /**
   * Present when `kind === 'apply'`. 1-based position into the result
   * list the agent last read aloud (1 = the first job).
   */
  index?: number;
}

/**
 * Canonical trade → speech synonyms across the languages we serve.
 * The canonical key is an English word that plausibly appears in job
 * titles/skills, since it is matched against them by the search.
 * Synonyms are matched as lowercased substrings of the transcript.
 */
const TRADE_LEXICON: ReadonlyArray<{
  trade: string;
  synonyms: readonly string[];
}> = [
  {
    trade: 'cook',
    synonyms: [
      'cook', 'cooking', 'chef', 'kitchen', 'rasoi', 'khana', 'bawarchi',
      'रसोइया', 'खाना', 'रसोई', 'बावर्ची',
      'சமையல்', 'சமையற்காரர்',
      'వంట', 'వంటవాడు',
      'ಅಡುಗೆ', 'ಅಡುಗೆಯವರು',
    ],
  },
  {
    trade: 'driver',
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
    synonyms: [
      'delivery', 'courier', 'parcel',
      'डिलीवरी', 'डिलिवरी',
      'டெலிவரி',
      'డెలివరీ',
      'ಡೆಲಿವರಿ',
    ],
  },
  {
    trade: 'electrician',
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
    synonyms: [
      'painter', 'painting',
      'पेंटर', 'रंगाई', 'रंग-रोगन',
      'ஓவியர்', 'பெயிண்டர்',
      'పెయింటర్', 'రంగు',
      'ಪೇಂಟರ್', 'ಬಣ್ಣ',
    ],
  },
  {
    trade: 'waiter',
    synonyms: [
      'waiter', 'server', 'steward', 'hotel',
      'वेटर', 'होटल',
      'பணியாளர்', 'வெயிட்டர்',
      'వెయిటర్', 'హోటల్',
      'ವೇಟರ್', 'ಹೋಟೆಲ್',
    ],
  },
  {
    trade: 'tailor',
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
    synonyms: [
      'mechanic', 'garage',
      'मैकेनिक', 'गैराज',
      'மெக்கானிக்', 'கேரேஜ்',
      'మెకానిక్', 'గ్యారేజ్',
      'ಮೆಕ್ಯಾನಿಕ್', 'ಗ್ಯಾರೇಜ್',
    ],
  },
];

/** Words that signal the worker wants to apply to a result they heard. */
const APPLY_WORDS: readonly string[] = [
  'apply', 'application', 'register me', 'sign me up',
  'i want this', 'i want that', 'take this one', 'book this',
  'अप्लाई', 'आवेदन', 'लगा दो', 'लगाओ', 'भर दो', 'भर दीजिए',
  'விண்ணப்பி', 'விண்ணப்பிக்க', 'அப்ளை',
  'దరఖాస్తు', 'అప్లై', 'దరఖాస్తు చేయి',
  'ಅರ್ಜಿ', 'ಅರ್ಜಿ ಹಾಕು', 'ಅಪ್ಲೈ',
];

/** Words that ask the agent to read its last reply again. */
const REPEAT_WORDS: readonly string[] = [
  'repeat', 'say again', 'say that again', 'again please', 'one more time',
  'come again', 'पहले',
  'फिर से', 'दोहरा', 'दुबारा', 'दोबारा',
  'மீண்டும்', 'திரும்ப சொல்',
  'మళ్లీ', 'మరల', 'మరోసారి',
  'ಮತ್ತೆ ಹೇಳಿ', 'ಪುನಃ',
];

/**
 * Phrases that ask about an upcoming interview — "when's my interview",
 * "do I have an interview". The agent reads back the next scheduled one.
 */
const INTERVIEW_PHRASES: readonly string[] = [
  'interview', 'when is my interview', "when's my interview", 'do i have an interview',
  'my interview', 'schedule my interview', 'interview time', 'interview date',
  'इंटरव्यू', 'साक्षात्कार', 'मेरा इंटरव्यू', 'इंटरव्यू कब है',
  'நேர்காணல்', 'எனது நேர்காணல்', 'இன்டர்வியூ',
  'ఇంటర్వ్యూ', 'నా ఇంటర్వ్యూ',
  'ಸಂದರ್ಶನ', 'ನನ್ನ ಸಂದರ್ಶನ',
];

/**
 * Phrases that ask the agent to read chat replies aloud — "read my
 * messages", "what did the employer say".
 */
const MESSAGE_PHRASES: readonly string[] = [
  'read my messages', 'check my messages', 'my messages', 'read messages',
  'what did the employer say', 'any messages', 'read my chat', 'read reply',
  'read replies',
  'मेरा मैसेज', 'मैसेज पढ़ो', 'संदेश पढ़ो', 'नियोक्ता ने क्या कहा',
  'எனது செய்திகள்', 'செய்தி படி', 'என்ன சொன்னார்',
  'నా సందేశాలు', 'సందేశం చదవండి', 'ఏమి చెప్పారు',
  'ನನ್ನ ಸಂದೇಶಗಳು', 'ಸಂದೇಶ ಓದಿ', 'ಏನು ಹೇಳಿದರು',
];

/** Phrases that ask what the agent can do. */
const HELP_PHRASES: readonly string[] = [
  'help', 'what can you do', 'what can i say', 'how does this work',
  'how do you work', 'what do i do',
  'मदद', 'क्या बोलूं', 'कैसे काम करता', 'कैसे बोलूं',
  'உதவி', 'என்ன சொல்ல',
  'సహాయం', 'ఏం చెప్పాలి',
  'ಸಹಾಯ', 'ಏನು ಹೇಳಲಿ',
];

/** Ordinal / cardinal words → the 1-based position they refer to. */
const ORDINALS: Readonly<Record<string, number>> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  // Hindi
  पहला: 1, पहली: 1, एक: 1,
  दूसरा: 2, दूसरी: 2, दूसरे: 2, दो: 2,
  तीसरा: 3, तीसरी: 3, तीन: 3,
  // Tamil
  முதல்: 1, ஒன்று: 1, ஒண்ணு: 1,
  இரண்டு: 2, ரெண்டு: 2, இரண்டாவது: 2,
  மூன்று: 3, மூணு: 3, மூன்றாவது: 3,
  // Telugu
  మొదటి: 1, ఒకటి: 1,
  రెండు: 2, రెండవ: 2,
  మూడు: 3, మూడవ: 3,
  // Kannada
  ಮೊದಲ: 1, ಒಂದು: 1,
  ಎರಡು: 2, ಎರಡನೇ: 2,
  ಮೂರು: 3, ಮೂರನೇ: 3,
};

/** First trade whose synonyms appear in the transcript, or null. */
function matchTrade(lc: string): string | null {
  for (const { trade, synonyms } of TRADE_LEXICON) {
    for (const syn of synonyms) {
      if (lc.includes(syn)) return trade;
    }
  }
  return null;
}

/** Pull a 1-based position out of the transcript ("2", "second", …). */
function extractIndex(lc: string): number | undefined {
  const digit = lc.match(/(?:^|\s)([1-9])(?:\s|$|st|nd|rd|th)/);
  if (digit) return Number(digit[1]);
  for (const word of Object.keys(ORDINALS)) {
    if (lc.includes(word)) return ORDINALS[word];
  }
  return undefined;
}

/**
 * Classify one line of recognised speech into a structured intent.
 *
 * Priority order matters: a clear apply signal beats everything; a
 * recognised trade is treated as a search *before* the help keyword is
 * checked, so "helper jobs" searches for helper work rather than being
 * mistaken for a cry for help.
 */
export function parseVoiceIntent(rawTranscript: string): VoiceIntent {
  const transcript = (rawTranscript ?? '').trim();
  if (!transcript) return { kind: 'unknown' };

  const lc = transcript.toLowerCase();
  const wordCount = transcript.split(/\s+/).length;
  const index = extractIndex(lc);

  // ─── apply ──────────────────────────────────────────────────────────
  // Either an explicit apply word, or a terse number/ordinal on its own
  // ("two", "the first one") which only makes sense as picking a result.
  const hasApplyWord = APPLY_WORDS.some((w) => lc.includes(w));
  const isBareOrdinal = index !== undefined && wordCount <= 3;
  if (hasApplyWord || isBareOrdinal) {
    return { kind: 'apply', index: index ?? 1 };
  }

  // ─── repeat ─────────────────────────────────────────────────────────
  if (REPEAT_WORDS.some((w) => lc.includes(w))) {
    return { kind: 'repeat' };
  }

  // ─── interviews ─────────────────────────────────────────────────────
  if (INTERVIEW_PHRASES.some((w) => lc.includes(w))) {
    return { kind: 'interviews' };
  }

  // ─── messages ───────────────────────────────────────────────────────
  if (MESSAGE_PHRASES.some((w) => lc.includes(w))) {
    return { kind: 'messages' };
  }

  // ─── search (trade recognised) ──────────────────────────────────────
  const trade = matchTrade(lc);
  if (trade) return { kind: 'search', query: trade };

  // ─── help ───────────────────────────────────────────────────────────
  if (HELP_PHRASES.some((w) => lc.includes(w))) {
    return { kind: 'help' };
  }

  // ─── search (generic) ───────────────────────────────────────────────
  // The worker said something job-shaped we couldn't pin to a trade —
  // fall back to a plain "jobs near me" search rather than giving up.
  return { kind: 'search', query: '' };
}

/**
 * Static catalogue of skill assessments.
 *
 * Each test is 5 multiple-choice questions, 4-of-5 correct to pass.
 * Pass earns a "✓ Tested: [trade]" pill on the seeker's resume —
 * separate from employer endorsements and complementary to them.
 *
 * The questions are deliberately practical: things a real worker
 * would know from doing the job, not textbook theory. We're filtering
 * for "is this person actually trained?", not "did they memorise the
 * manual?".
 */

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into `options` of the correct answer. */
  correctIndex: number;
}

export interface SkillTest {
  /** Stable slug — matches a trade slug from the catalogue. */
  id: string;
  /** Display title shown on the test card. */
  title: string;
  /** One-line tagline on the test card. */
  tagline: string;
  emoji: string;
  /** Coarse difficulty bucket. */
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Estimated time to complete in minutes. */
  durationMinutes: number;
  /** Pass threshold — out of `questions.length`. */
  passingScore: number;
  questions: QuizQuestion[];
}

const electrician: SkillTest = {
  id: 'electrician',
  title: 'Electrician — basics',
  tagline: 'Safety, wiring colours, and circuit sense',
  emoji: '⚡',
  level: 'intermediate',
  durationMinutes: 5,
  passingScore: 4,
  questions: [
    {
      id: 'colours',
      question: 'In standard Indian household wiring, the EARTH wire is which colour?',
      options: ['Red', 'Black', 'Green (or green-yellow)', 'Blue'],
      correctIndex: 2,
    },
    {
      id: 'mcb',
      question: 'A 10A MCB trips repeatedly when you switch on a heater. Most likely cause:',
      options: [
        'Heater draws more than 10A — needs a higher-rated breaker or different circuit',
        'MCB is broken; replace it with a 20A one immediately',
        'Wiring is fine; the heater is faulty',
        'No issue — keep resetting it until it holds',
      ],
      correctIndex: 0,
    },
    {
      id: 'safety',
      question: 'Before working on a live socket, the FIRST thing you should do is:',
      options: [
        'Test the socket with your finger to feel for current',
        'Switch off the mains and test with a tester pen before touching wires',
        'Wear rubber slippers and start working',
        'Disconnect the appliance first, then unscrew',
      ],
      correctIndex: 1,
    },
    {
      id: 'earthing',
      question: 'A 3-pin plug\'s longest pin is for:',
      options: ['Live', 'Neutral', 'Earth (ground)', 'Switch'],
      correctIndex: 2,
    },
    {
      id: 'shortcircuit',
      question: 'A short circuit happens when:',
      options: [
        'Live and neutral wires touch directly with no load between them',
        'A bulb fuses',
        'Voltage drops below 220V',
        'The MCB is too small',
      ],
      correctIndex: 0,
    },
  ],
};

const cook: SkillTest = {
  id: 'cook',
  title: 'Cook — kitchen basics',
  tagline: 'Food safety, knife skills, and timing',
  emoji: '👨‍🍳',
  level: 'beginner',
  durationMinutes: 4,
  passingScore: 4,
  questions: [
    {
      id: 'meat-temp',
      question: 'Cooked chicken is safe to eat when its internal temperature reaches at least:',
      options: ['50 °C', '65 °C', '74 °C', '95 °C'],
      correctIndex: 2,
    },
    {
      id: 'cross-contam',
      question: 'You\'ve just cut raw chicken. Before chopping vegetables on the same board you should:',
      options: [
        'Wipe the board with a kitchen towel',
        'Wash the board and knife with soap + hot water, then dry',
        'Flip the board over and use the other side',
        'Spray the board with vinegar and continue',
      ],
      correctIndex: 1,
    },
    {
      id: 'oil-temp',
      question: 'Smoke is rising heavily from a pan of oil. You should:',
      options: [
        'Add water to cool the oil',
        'Turn off the heat, slide the pan aside, do NOT add water',
        'Add cold oil to bring the temperature down',
        'Cover the pan tightly and walk away',
      ],
      correctIndex: 1,
    },
    {
      id: 'storage',
      question: 'Cooked rice should be cooled to room temperature and refrigerated within:',
      options: ['Up to 30 minutes', 'Up to 2 hours', 'Up to 6 hours', 'It\'s safe to leave overnight'],
      correctIndex: 1,
    },
    {
      id: 'knife',
      question: 'Which is the safest knife to use for chopping:',
      options: [
        'A very dull knife — less chance of cutting yourself',
        'A sharp knife held with a claw grip on the guiding hand',
        'A sharp knife held with the index finger extended on top of the blade',
        'Any knife — it doesn\'t matter as long as you\'re careful',
      ],
      correctIndex: 1,
    },
  ],
};

const delivery: SkillTest = {
  id: 'delivery',
  title: 'Delivery rider — basics',
  tagline: 'Road safety, navigation, customer handoff',
  emoji: '🛵',
  level: 'beginner',
  durationMinutes: 4,
  passingScore: 4,
  questions: [
    {
      id: 'helmet',
      question: 'For a 200-metre delivery to the next block, you should:',
      options: [
        'Skip the helmet — too short to bother',
        'Wear the helmet — most accidents happen on short trips',
        'Wear the helmet only if it\'s raining',
        'Wear the helmet only if the customer is watching',
      ],
      correctIndex: 1,
    },
    {
      id: 'late',
      question: 'You\'re running 8 minutes late on a hot food order. The right move:',
      options: [
        'Don\'t mention it — the customer might not notice',
        'Message the customer with a brief honest update and ETA',
        'Cancel the order to avoid a bad rating',
        'Drive faster to make up time',
      ],
      correctIndex: 1,
    },
    {
      id: 'wrong-address',
      question: 'The address on the order leads you to an empty plot. You should:',
      options: [
        'Wait there for 15 minutes — the customer will come',
        'Mark the order undelivered and leave',
        'Call the customer for a landmark or building name',
        'Drop the order at the nearest house and finish',
      ],
      correctIndex: 2,
    },
    {
      id: 'handoff',
      question: 'When handing food to a customer, which earns better tips:',
      options: [
        'Hand it over quickly without speaking — saves time',
        'Greet them, hand the food right-side up, say "Have a good meal"',
        'Demand the tip in cash before handing over',
        'Show the customer the order receipt before they take the food',
      ],
      correctIndex: 1,
    },
    {
      id: 'rain',
      question: 'Riding in heavy rain. The most important adjustment:',
      options: [
        'Speed up to get home quicker',
        'Slow down — tyres grip half as well, braking distance doubles',
        'Switch off headlight to save battery',
        'Take shortcuts through narrow gullies',
      ],
      correctIndex: 1,
    },
  ],
};

export const SKILL_TESTS: SkillTest[] = [electrician, cook, delivery];

export function findSkillTest(id: string): SkillTest | undefined {
  return SKILL_TESTS.find((t) => t.id === id);
}

/**
 * Public-facing view that hides the correct answers — used by the
 * mobile to render the quiz UI. The server keeps the authoritative
 * answer key.
 */
export interface PublicSkillTest {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  level: SkillTest['level'];
  durationMinutes: number;
  passingScore: number;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
  }>;
}

export function toPublic(test: SkillTest): PublicSkillTest {
  return {
    id: test.id,
    title: test.title,
    tagline: test.tagline,
    emoji: test.emoji,
    level: test.level,
    durationMinutes: test.durationMinutes,
    passingScore: test.passingScore,
    questions: test.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    })),
  };
}

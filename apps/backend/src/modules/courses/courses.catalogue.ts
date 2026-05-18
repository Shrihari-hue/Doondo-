/**
 * Static curated course catalogue.
 *
 * No admin UI yet — courses are typed up here in code, ship with each
 * release, and the seeker progresses through them via the Enrollment
 * model (which IS in the database). Adding/editing a course is a code
 * change + redeploy, which is fine while we're building muscle on what
 * content actually moves the needle. When we have hundreds of courses
 * and a real authoring team, we'll back this with a DB collection.
 *
 * Each lesson is a short markdown-ish text block — 3-5 minutes of
 * reading. We deliberately keep lessons short and many: blue-collar
 * workers learn in small bites between gigs, not in 45-minute
 * sit-downs.
 *
 * A worker who completes ALL lessons in a course earns the course
 * badge (`completedAt` is set on their Enrollment). That badge shows
 * on their resume preview and on the employer's applicant detail
 * card so finishing the course is materially useful to them.
 */

export interface CourseLesson {
  id: string;
  title: string;
  /** Plain-text body. Newlines preserved for client rendering. */
  body: string;
  /** Estimated reading time. Sums up to the course total on Course. */
  durationMinutes: number;
}

export interface Course {
  /** Stable slug — referenced by Enrollment.courseId and never changes. */
  id: string;
  title: string;
  /** One-sentence elevator pitch shown on the catalogue card. */
  tagline: string;
  /** Longer description shown on the detail screen. */
  description: string;
  /** Tile emoji + tint pair drives the catalogue card visual. */
  emoji: string;
  tint: string;
  /** Coarse difficulty bucket — visible on the card. */
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Sum of lesson durations — pre-computed for sort + display. */
  totalDurationMinutes: number;
  /** Trade slugs this course is most relevant to. Used for sort/recommend. */
  relevantTrades: string[];
  /**
   * Skill slugs the course actually teaches. Granular — a single course
   * can teach several skills. Used by skillGap.service to recommend a
   * course when a seeker is rejected for a job whose `Job.skills` list
   * the seeker doesn't yet have. Empty = course is trade-only and not a
   * skill-gap candidate.
   */
  teachesSkills: string[];
  lessons: CourseLesson[];
}

// ─── The actual courses ─────────────────────────────────────────────────────

const customerServiceBasics: Course = {
  id: 'customer_service_basics',
  title: 'Customer service basics',
  tagline: 'Talk to customers the way the best workers do.',
  description:
    'For shop assistants, salon workers, retail staff, restaurant servers — anyone who deals with customers face to face. Five short lessons on greeting, listening, handling complaints, and turning a one-time customer into a regular.',
  emoji: '🤝',
  tint: '#DBEAFE',
  level: 'beginner',
  totalDurationMinutes: 22,
  relevantTrades: ['shop_assistant', 'cashier', 'waiter', 'salon', 'kitchen_helper'],
  teachesSkills: ['customer_service', 'communication', 'complaint_handling', 'upselling'],
  lessons: [
    {
      id: 'greet',
      title: 'The first 10 seconds',
      durationMinutes: 4,
      body: `When a customer walks in, you have about 10 seconds to make them feel welcome. Three things to do every single time:

1. Make eye contact and smile. Even from across the room.
2. Greet them with their name if you know it ("Welcome back, sir"). Otherwise a simple "Namaste" or "Hello" works.
3. Stop whatever else you're doing and turn toward them. Customers can tell when they're an interruption.

A customer who feels seen in the first 10 seconds is twice as likely to come back. That's the difference between a good shop and a great one.`,
    },
    {
      id: 'listen',
      title: 'Listen before you speak',
      durationMinutes: 4,
      body: `Most workers start selling before the customer has finished talking. Don't.

Let them describe what they need. Nod. Ask one question: "What is it for?" or "Who is this for?". Then suggest.

When you listen first, you sell less but you sell better — the customer trusts your recommendation, buys what they actually need, and comes back next time.`,
    },
    {
      id: 'complaints',
      title: 'Handling complaints calmly',
      durationMinutes: 5,
      body: `A complaint is a gift. The customer is telling you what's wrong — most unhappy customers say nothing and just never return.

Four steps when someone complains:
1. Listen fully. Don't interrupt, even if you disagree.
2. Apologise for the experience (not the company). "I'm sorry this happened to you."
3. Ask what would make it right. Often it's smaller than you'd think.
4. Do it, or get someone who can.

Never argue. Never blame another worker out loud. Never say "It's the rule."`,
    },
    {
      id: 'upsell',
      title: 'Suggesting more without pushing',
      durationMinutes: 4,
      body: `Good upselling is a recommendation, not a sales pitch. If a customer is buying paint, they probably need a roller. Tell them — they'll thank you.

The rule: only suggest things that make the original purchase better. "This brush works much better with this paint." Never "Buy more because we have a promo."

A customer can tell the difference between help and pressure within one sentence.`,
    },
    {
      id: 'goodbye',
      title: 'The last 10 seconds',
      durationMinutes: 5,
      body: `The end of the interaction matters as much as the beginning. Three things to do:

1. Thank them by name if you remember it.
2. Tell them what happens next — when their order arrives, when they should come back, what to do if there's a problem.
3. Hand them your business card or write your name on the receipt. Make yourself the person they ask for next time.

Regular customers don't choose shops — they choose people.`,
    },
  ],
};

const deliveryRiderEssentials: Course = {
  id: 'delivery_rider_essentials',
  title: 'Delivery rider essentials',
  tagline: 'Faster, safer, better tips.',
  description:
    'For new and experienced delivery riders. Road safety, app navigation, dealing with customers at the door, and how to earn 30% more in tips without working more hours.',
  emoji: '🛵',
  tint: '#FEE2E2',
  level: 'beginner',
  totalDurationMinutes: 24,
  relevantTrades: ['delivery', 'driver_light'],
  teachesSkills: ['road_safety', 'app_navigation', 'customer_service', 'time_management', 'rating_management'],
  lessons: [
    {
      id: 'safety',
      title: 'Safety on the road',
      durationMinutes: 6,
      body: `Helmet. Always. Even for a 200m delivery. Most accidents happen on the short trips because you don't think to put it on.

Other rules that save lives:
- Don't look at your phone while riding. Pull over.
- Keep a full tank — running out of fuel mid-delivery is when people make bad decisions on the road.
- Rain = slow down by half. Tyres don't grip the way you remember.
- Watch the doors of parked cars. Bike riders get hit by opening doors more than any other thing.

Your bike is your tool. A broken arm means no earnings for two months. Be careful.`,
    },
    {
      id: 'app',
      title: 'Using the app well',
      durationMinutes: 4,
      body: `Mark "Picked up" as soon as you have the order — even if you're not riding yet. The customer's countdown starts when you mark pickup, so the longer you wait, the more rushed you'll feel.

When you arrive, mark "At delivery location" before you knock. Some apps track this for your rating.

If the customer is late to come down, call them. Don't wait silently. A 30-second call beats a 3-minute wait.`,
    },
    {
      id: 'doorstep',
      title: 'At the doorstep',
      durationMinutes: 4,
      body: `Three things customers remember:
1. You called them by name when you arrived.
2. You handed the food right-side up so it didn't spill.
3. You smiled and said "Have a good meal."

These cost you nothing and they're the difference between a ₹0 tip and a ₹50 tip.

Never argue about a wrong address — call the customer, ask for the building name or a landmark, then move. Arguing wastes time and rating.`,
    },
    {
      id: 'tips',
      title: 'How to earn more tips',
      durationMinutes: 5,
      body: `Three things double your tip rate:

1. Speed. Customers tip when food arrives hot. If you can do it in 22 minutes instead of 30, you'll see it in your tip count.
2. Communication. Send a message when you pick up, and another when you're 2 minutes away. The customer knows you're coming.
3. Cleanness. Wipe the bag occasionally. Wash your hands before handing over the food. Customers notice.

A 10% tip rate beats a 5% tip rate by the same amount as taking 5 extra orders a day. The maths is on your side.`,
    },
    {
      id: 'rating',
      title: 'Protecting your rating',
      durationMinutes: 5,
      body: `A 4.9 rating earns more orders than a 4.6. Apps surface higher-rated riders first.

Three rating killers:
- Cancelling an order after accepting (very bad). Don't accept if you're not sure.
- Late by more than 10 minutes. If you'll be late, message the customer with a real reason.
- Rude tone in messages. The customer screenshots and reports.

If a customer rates you 1 star unfairly, you can request a review in the app. Be polite, give the facts, don't argue. Most unfair ratings get removed if you ask.`,
    },
  ],
};

const electricalSafety: Course = {
  id: 'electrical_safety',
  title: 'Electrical safety basics',
  tagline: 'Five lessons every electrician should know cold.',
  description:
    "Even experienced electricians get complacent. This refresher covers the five things that kill or seriously injure electricians on the job — and how to never be one of them.",
  emoji: '⚡',
  tint: '#FEF3C7',
  level: 'intermediate',
  totalDurationMinutes: 25,
  relevantTrades: ['electrician', 'mechanic'],
  teachesSkills: ['electrical_safety', 'wiring', 'circuit_testing', 'tool_use', 'risk_assessment'],
  lessons: [
    {
      id: 'turn_it_off',
      title: 'Turn it off. Lock it out. Test it.',
      durationMinutes: 5,
      body: `Three steps before any work:
1. TURN IT OFF at the main breaker. Not the switch — the breaker.
2. LOCK IT OUT. A piece of tape or a padlock on the breaker that says "Do not turn on — electrician working." Tell the homeowner.
3. TEST IT. Use a tester on the wires you're about to touch. Every single time.

The number of electricians who die because someone else flipped a switch back on is shocking. The padlock and the tester are five rupees and five minutes. Use them.`,
    },
    {
      id: 'wet_hands',
      title: 'Water + electricity',
      durationMinutes: 5,
      body: `Wet hands. Wet floor. Wet tools. All deadly.

Before touching any wire:
- Dry your hands and tools thoroughly.
- Check the floor — if it's wet, dry it or stand on something dry (a wooden plank, a thick rubber mat).
- After rain, wait. Wet rooms after a leak are not safe to work in even with power off — there could be a second circuit you don't know about.

Bathrooms and kitchens kill more electricians than any other room. Treat them with extra care.`,
    },
    {
      id: 'one_hand',
      title: 'Work with one hand',
      durationMinutes: 5,
      body: `When you do have to work near live wires (you shouldn't, but sometimes you have to test something live):

- Put your left hand in your pocket. Keep it there.
- Use only your right hand to touch anything.

If current passes from one hand to the other, it goes through your heart. If it only passes through one arm and out your feet, it might just hurt. The one-hand rule is the difference between a scary day and a dead one.`,
    },
    {
      id: 'tools',
      title: 'Your tools matter',
      durationMinutes: 5,
      body: `Cheap tools kill electricians.

Spend a little more on:
- Insulated screwdrivers (rated 1000V minimum)
- Linesman's pliers with rubber grip
- A real voltage tester (not a tester pen — those lie)
- A proper multimeter

Replace anything cracked, frayed, or bent. Insulation only works when it's intact.

Lend tools to friends only if you trust them to bring them back the way they took them. A friend with a damaged tool is a friend with a hospital bill.`,
    },
    {
      id: 'when_to_walk_away',
      title: 'When to refuse a job',
      durationMinutes: 5,
      body: `Some jobs are not worth the money:
- A house where the wiring is so old you can't tell what's connected to what.
- A customer who insists you work without turning the power off ("Bas thoda kaam hai, chalu rakho").
- A site with standing water and live circuits.
- An employer who refuses to provide safety gear.

A reputation as a safe electrician brings you more steady work than a reputation as a fast one. Walking away once costs you one job. Walking away twice gets you known as the careful one — and the careful one gets the high-paying jobs that the reckless ones can't get.`,
    },
  ],
};

const workplaceSafety: Course = {
  id: 'workplace_safety',
  title: 'Workplace safety for everyone',
  tagline: 'How to stay safe on any worksite.',
  description:
    'Construction, kitchens, warehouses, salons — every workplace has hazards. Four short lessons on PPE, lifting properly, what to do in an accident, and your right to refuse unsafe work.',
  emoji: '🦺',
  tint: '#D1FAE5',
  level: 'beginner',
  totalDurationMinutes: 18,
  relevantTrades: ['helper', 'mason', 'carpenter', 'warehouse', 'kitchen_helper', 'cleaner'],
  teachesSkills: ['workplace_safety', 'ppe_use', 'manual_lifting', 'first_aid_basics', 'labour_rights'],
  lessons: [
    {
      id: 'ppe',
      title: 'Protective gear, every time',
      durationMinutes: 4,
      body: `Helmet on a construction site. Closed shoes in a kitchen. Gloves when lifting heavy. Mask when sanding or painting.

Employers are legally required to provide safety gear. If they don't, ask. If they refuse, refuse the work — and tell Doondo Support so we can flag the employer.

Five minutes of PPE has saved more workers than every clinic in this city combined.`,
    },
    {
      id: 'lifting',
      title: 'Lifting without wrecking your back',
      durationMinutes: 4,
      body: `Bend your knees. Not your back. Every time.

The rule: if it's heavier than 25kg, get help. There's no medal for carrying it alone. A slipped disc means no work for six months.

Other rules:
- Hold the load close to your body, not at arm's length.
- Don't twist while lifting — turn your whole body.
- Push, don't pull, when you can.

Your back is the most expensive thing on your body. Take care of it.`,
    },
    {
      id: 'accident',
      title: 'When something goes wrong',
      durationMinutes: 5,
      body: `If someone is hurt on the job:
1. Don't move them unless they're in immediate danger.
2. Call 108 (ambulance). Free, all of India.
3. Stop the bleeding if you can — direct pressure with a clean cloth.
4. Tell the foreman / shop owner immediately.

For yourself: if you're hurt, even a small cut, clean it and report it. Small infections become big ones when you don't.

Always take photos before the site is cleaned up — they're proof for compensation later if needed.`,
    },
    {
      id: 'refuse',
      title: 'Your right to refuse unsafe work',
      durationMinutes: 5,
      body: `You have a legal right to refuse work that's dangerous. You cannot be fired for refusing unsafe work in India.

Examples of work you can refuse:
- A scaffolding without a safety rail.
- Wiring with the power on and no safety gear.
- Operating a machine you haven't been trained on.
- Working alone with hazardous chemicals.

If an employer threatens you for refusing, get it in writing (a WhatsApp message is fine). Then call the labour department or Doondo Support. Your life is worth more than this job.`,
    },
  ],
};

const englishAtWork: Course = {
  id: 'english_at_work',
  title: 'Basic English at work',
  tagline: 'The 30 phrases that get you through any workday.',
  description:
    "For workers whose English is limited but who deal with English-speaking customers or supervisors. Five lessons of practical phrases — greetings, questions, problem-solving — with examples you can use today.",
  emoji: '🗣️',
  tint: '#EDE9FE',
  level: 'beginner',
  totalDurationMinutes: 25,
  relevantTrades: [
    'salon',
    'cashier',
    'shop_assistant',
    'waiter',
    'delivery',
    'driver_light',
    'security_guard',
  ],
  teachesSkills: ['english', 'communication', 'customer_service', 'numeracy'],
  lessons: [
    {
      id: 'greetings',
      title: 'Greetings and the basics',
      durationMinutes: 5,
      body: `Six phrases you'll use every day:

- "Good morning / Good afternoon" — better than "Hi" with strangers
- "How may I help you?"
- "Please wait one moment."
- "Thank you for your patience."
- "Is there anything else?"
- "Have a good day."

Practice each one out loud. The words are easy — the part you need to drill is saying them naturally without thinking.`,
    },
    {
      id: 'questions',
      title: 'Asking the right questions',
      durationMinutes: 5,
      body: `When you don't know something, ask. Don't fake it.

- "Could you say that again, please?"
- "I didn't catch that. Could you repeat?"
- "Do you mean ___?" (and repeat what you heard)
- "Sorry, my English is small. Please say slowly."

Customers respect honesty more than they respect pretending. The first time you say "Could you repeat?" feels hard. The fiftieth time, it's nothing.`,
    },
    {
      id: 'problems',
      title: 'When something is wrong',
      durationMinutes: 5,
      body: `- "I'm sorry, we don't have that today."
- "Let me check for you."
- "I'll find someone who can help."
- "I'm sorry for the trouble."
- "Could you wait two minutes?"

Notice none of these say "It's not my job" or "Not possible". Even when the answer is no, the words around it matter.`,
    },
    {
      id: 'numbers',
      title: 'Numbers, money, and time',
      durationMinutes: 5,
      body: `Common at the counter:
- "That's ___ rupees."
- "Your change is ___."
- "The total is ___."
- "We open at 9 and close at 9."
- "It will take 20 minutes."

Drill numbers in English up to 10,000. Most counter work needs no more than this.`,
    },
    {
      id: 'farewells',
      title: 'Saying goodbye',
      durationMinutes: 5,
      body: `- "Thank you for coming."
- "Please come again."
- "Have a good day / evening."
- "See you next time."

These small phrases at the end of a sale make customers come back. Try them today.`,
    },
  ],
};

// ─── Catalogue ──────────────────────────────────────────────────────────────

export const COURSES: Course[] = [
  customerServiceBasics,
  deliveryRiderEssentials,
  electricalSafety,
  workplaceSafety,
  englishAtWork,
];

export function findCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export function findLesson(
  courseId: string,
  lessonId: string,
): { course: Course; lesson: CourseLesson } | undefined {
  const course = findCourse(courseId);
  if (!course) return undefined;
  const lesson = course.lessons.find((l) => l.id === lessonId);
  if (!lesson) return undefined;
  return { course, lesson };
}

/**
 * Navigation type maps. Adding a screen? Add it here so navigation.navigate()
 * stays type-safe.
 *
 * The root has two stacks:
 *   - AuthStack: RolePicker (3D opener) → Signup, plus Login + ForgotPassword
 *   - AppStack:  SeekerTabs / EmployerTabs depending on user.role, with
 *                modal screens (JobDetail, EditProfile) stacked on top
 *
 * RootNavigator picks which stack to show based on auth status.
 */

import type { JobType, UserRole, WorkType } from '@/api/types';

export type AuthStackParamList = {
  /** First-launch walkthrough (3 slides). Gated by a secure-store flag. */
  Onboarding: undefined;
  RolePicker: undefined;
  Welcome: undefined;
  Login: undefined;
  /**
   * "60-second first match" — wedge screen between RolePicker and
   * Signup for seekers only. Shows 3 real jobs near the user before
   * asking for any commitment. `workType` + `teamSize` carry through
   * from the Solo/Team sheet so Signup still gets the right preset.
   */
  FirstMatchPreview: {
    workType: WorkType;
    teamSize?: number;
  };
  /** Optional initial role/work style — passed in from the role picker. */
  Signup:
    | {
        role?: UserRole;
        workType?: WorkType;
        teamSize?: number;
      }
    | undefined;
  /** Step 1 — user enters the phone we should send a reset OTP to. */
  ForgotPassword: undefined;
  /** Step 2 — user enters the 6-digit OTP they received. */
  ForgotPasswordCode: { phone: string; expiresAt: string };
  /** Step 3 — user picks a new password. */
  ResetPassword: { phone: string; resetToken: string };
};

export type SeekerTabParamList = {
  /** Home dashboard — voice card, categories, nearby jobs preview. */
  Home: undefined;
  /** Full jobs list — accepts an initial query keyword from category tile / voice. */
  Jobs: { initialQuery?: string } | undefined;
  /** Community hub — find work buddies, mentors, ratings & reviews. */
  Community: undefined;
  /** Conversations list. */
  Chat: undefined;
  /** Earnings hub — payout ledger, cash advance, worker insurance. */
  Earnings: undefined;
  /** Profile — verified badge, rating, salary, skills, menu. */
  Profile: undefined;
};

export type EmployerTabParamList = {
  /** Command center — what needs the employer's attention right now. */
  EmployerHome: undefined;
  /** Job postings (the former Posts tab). */
  EmployerJobs: undefined;
  /** Find workers (discovery) + the hired workforce. */
  Workers: undefined;
  /** Conversations with applicants and hired workers. */
  Chat: undefined;
  /** Business profile, verification, reviews, payouts, settings. */
  EmployerProfile: undefined;
  /**
   * Cross-job applicant list (all applicants across every posted job).
   * Not shown as its own bottom-bar icon — reached from "View all" on
   * Recent Activity, the notification tray, chat/notification deep links,
   * and the voice agent. Registered here so `navigate('Applicants')` /
   * `navigate('EmployerTabs', { screen: 'Applicants' })` resolves instead
   * of failing at runtime.
   */
  Applicants: undefined;
};

export type AppStackParamList = {
  /** Seeker tab host (set when user.role === 'seeker'). */
  SeekerTabs: undefined;
  /** Employer tab host (set when user.role === 'employer'). */
  EmployerTabs: undefined;
  /**
   * Modal: full-screen job detail with apply CTA (seeker view).
   *
   * `fromMode` lets the screen swap its sticky CTAs:
   *   - 'today'     → "I'm interested" + "Message employer" (one-tap)
   *   - 'this_week' → same as career — full Apply Now flow
   *   - 'career' (default) → existing Apply Now flow, unchanged
   */
  JobDetail: {
    jobId: string;
    fromMode?: 'today' | 'this_week' | 'career';
    /** Referrer user id when the seeker arrived via a friend's share link. */
    ref?: string;
  };
  /** Modal: applicants for one of the employer's jobs. */
  JobApplicants: { jobId: string; jobTitle?: string };
  /** Per-employer worker hub — attendance, payslip, schedule, shift tools. */
  MyEmployerJob: { employerId: string; employerName: string };
  /** Modal: a single applicant — full seeker profile + actions. */
  ApplicantDetail: { applicationId: string };
  /** Modal: hired worker detail — trust score, contact info, action tabs. */
  WorkerDetail: { applicationId: string };
  /** Modal: worker attendance calendar for a given month. */
  WorkerAttendance: { applicationId: string; workerName: string };
  /** Modal: worker salary breakdown + payment history. */
  WorkerSalary: { applicationId: string; workerName: string };
  /** Modal: task list assigned to a worker. */
  WorkerTasks: { applicationId: string; workerName: string };
  /** Modal: chronological activity timeline for a worker. */
  WorkerActivity: { applicationId: string; workerName: string };
  /** Modal: worker's verified documents. */
  WorkerDocuments: { applicationId: string; workerName: string };
  /** Modal: monthly performance review form for a hired worker. */
  WorkerPerformance: { applicationId: string; workerName: string };
  /** Modal: batch payroll summary — mark all workers as paid. */
  RunPayroll: undefined;
  /** Modal: weekly roster / schedule grid. */
  Roster: undefined;
  /** Modal: employer analytics dashboard. */
  EmployerAnalytics: undefined;
  /** Modal: post a new job (employer), or edit/duplicate an existing one. */
  PostJob: {
    /** When set, the screen runs in "edit" mode — PATCH instead of POST. */
    editJobId?: string;
    /** When set, fields are pre-filled for a duplicate (no editJobId). */
    prefill?: {
      title: string;
      description: string;
      type: string;
      amount: string;
      period: string;
      skills: string[];
    };
  } | undefined;
  /** Modal: employer notification preferences — per-event toggles persisted to secureStore. */
  NotifPreferences: undefined;
  /** Modal: time-off / absence requests from hired workers — approve or deny. */
  TimeOffRequests: undefined;
  /** Modal: full-screen conversation thread. */
  Conversation: { conversationId: string };
  /** Modal: edit a profile section (seeker or employer). */
  EditProfile: {
    section:
      | 'basics'
      | 'location'
      | 'skills'
      | 'preferences'
      | 'resume'
      | 'business_basics'
      | 'business_location';
  };
  /** Modal: phone-OTP + selfie verification flow (Phase 5). */
  Verification: undefined;
  /**
   * Modal: add (or replace) the recovery phone for accounts that signed up
   * before phone became required at registration. Same OTP step as
   * Verification, but stops short of the selfie — the only goal is to put
   * a working number on file for password reset.
   */
  AddRecoveryPhone: undefined;
  /**
   * Modal: the conversational voice job-search agent — speak a search,
   * hear the results read back, apply by voice. Pushed by the center
   * FAB mic.
   */
  VoiceAgent: undefined;
  /** Modal: employer voice assistant — speak to find workers, view applicants, post jobs. */
  EmployerVoiceAgent: undefined;
  /** Screen: employer wallet top-up via UPI. */
  WalletTopUp: undefined;
  /**
   * Modal: "Doondo for Women" hub — Women's Mode toggle, a curated feed
   * of women-safe jobs, safe-work guidance, and the safety tools.
   */
  WomenHub: undefined;
  /** Modal: record / manage the worker's Hire Reels intro video. */
  RecordReel: undefined;
  /** Modal: the employer's Hire Reels discovery feed of worker intros. */
  ReelFeed: undefined;
  /** Modal: list of ratings received by a user (defaults to self). */
  Ratings: { userId?: string } | undefined;
  /** Modal: leave a rating after a hire. */
  LeaveRating: {
    applicationId: string;
    /** Display name of the person being rated. */
    revieweeName: string;
    /** Title of the job this rating is for. */
    jobTitle: string;
  };
  /** Modal: notifications feed (bell icon target). */
  Notifications: undefined;
  /** Modal: edit the seeker's desired pay (amount + period). */
  EditExpectedSalary: undefined;
  /** Modal: list of applications the seeker has submitted. */
  MyApplications: undefined;
  /** Modal: the worker's active jobs hub — attendance, shifts, payslips. */
  MyJob: undefined;
  /** Modal: saved + applied jobs in one screen. */
  MyJobs: undefined;
  /** Modal: pick an application to start a chat from (seeker). */
  NewChat: undefined;
  /** Modal: settings — language, notifications, theme, account. */
  Settings: undefined;
  /** Modal: seeker earnings ledger. */
  MyEarnings: undefined;
  /** Doondo Collect — worker bank account, collection QR, withdrawals. */
  Collect: undefined;
  /** Modal: offline-saved jobs list. */
  DownloadCenter: undefined;
  /** Modal: public employer detail (the "About this employer" page). */
  EmployerDetail: { userId: string };
  /** Modal: worker-safety SOS — pick contact + trigger help SMS. */
  Sos: { alertId?: string } | undefined;
  /**
   * Modal: manage the seeker's Trust Circle (up to 3 emergency
   * contacts who get pushed on SOS) and the peer-responder opt-in.
   */
  TrustCircle: undefined;
  /**
   * Modal: snap a photo of a resume / ID / handwritten sheet and let
   * AI fill the profile. Confirmation screen lets the seeker edit
   * before saving. The biggest activation lever for low-literacy users.
   */
  ProfileFromPhoto: undefined;
  /** Modal: guided resume builder (1-5 jobs wizard). */
  ResumeBuilder: undefined;
  /** Modal: read-only resume preview, sharable. */
  ResumePreview: undefined;
  /**
   * Modal: Smart Resume — an AI-tailored version of the worker's resume
   * for one specific job. Entered from the job detail screen.
   */
  TailoredResume: { jobId: string; jobTitle?: string };
  /** Modal: list of saved job alerts + toggle/edit/delete. */
  JobAlerts: undefined;
  /**
   * Modal: create or edit a job alert.
   *   - alertId    → edit mode (form hydrates from the existing alert)
   *   - suggestion → seed initial form values (used by the "Suggested for
   *                  you" banner that's derived from the seeker's resume)
   */
  JobAlertForm:
    | {
        alertId?: string;
        suggestion?: {
          name: string;
          query?: string | null;
          city?: string | null;
          jobTypes?: JobType[];
          urgentOnly?: boolean;
        };
      }
    | undefined;
  /** Modal: employers see seekers broadcasting "available now" nearby. */
  AvailableWorkers: undefined;
  /** Modal: employer's saved crew + import-from-contacts. */
  Workforce: undefined;
  /**
   * Modal: employer picks one of their active jobs + an optional note to
   * invite a specific worker (the outbound half of two-way discovery).
   */
  SendHiringRequest: { seekerId: string; seekerName: string };
  /** Modal: one worker's Hire Reels intro video, with a Contact action. */
  SeekerReel: { seekerId: string; seekerName: string };
  /** Modal: the worker's inbox of hiring requests from employers. */
  HiringRequests: undefined;
  /** Modal: the employer's list of hiring requests they've sent out. */
  SentHiringRequests: undefined;
  /** Modal: the employer's inbound list of workers who expressed interest. */
  InterestedWorkers: undefined;
  /** Modal: catalogue of training courses. */
  Courses: undefined;
  /** Modal: a single course with its lessons + progress + enroll CTA. */
  CourseDetail: { courseId: string };
  /**
   * Modal: "Why was I rejected?" — the AI paragraph explaining a
   * rejection plus similar jobs hiring now. Opened from the inline
   * skill-gap card on My Applications.
   */
  WhyRejected: { applicationId: string };
  /** Modal: skill assessments — catalogue + take-test flow. */
  SkillTests: undefined;
  /** Modal: the worker's portable, verified Skill Passport. */
  SkillPassport: undefined;
  /**
   * Modal: the shareable Doondo Score QR credential — a signed,
   * scannable proof of the worker's employability score.
   */
  ScoreCredential: undefined;
  /**
   * Modal: the shareable Skill Passport QR credential — a signed,
   * scannable proof of the worker's verified skills, jobs completed,
   * and rating. Same pattern as ScoreCredential, richer payload.
   */
  PassportCredential: undefined;
  /** Modal: my mentor-session calendar — open slots (as mentor) + booked sessions (either side). */
  MentorSessions: undefined;
  /** Modal: pick one of a mentor's open bookable slots. */
  BookMentorSession: { mentorUserId: string; mentorName?: string; trade: string };
  /** Modal: my peer cohorts — joined groups + pending invites. */
  Cohorts: { cohortId?: string };
  /** Modal: start a new cohort from a course + matched Find Friends contacts. */
  StartCohort: { courseId?: string; preselect?: { id: string; name: string; photoUrl: string | null }[] };
  /** Modal: one cohort's group chat. */
  CohortChat: { cohortId: string };
  /** Modal: Wage Strike Alerts — flag one job's wage practices. Anonymous. */
  ReportWageIssue: { jobId: string; jobTitle: string };
  /** Modal: the worker's Doondo Constitution — personal work rules. */
  Constitution: undefined;
  /** Modal: the career-path ladder for a trade. */
  CareerPath: undefined;
  /** Modal: PF / ESI / income-tax explainer for first formal jobs. */
  PayslipExplainer: undefined;
  /** Modal: interview / trial-day prep — short tips per trade. */
  InterviewPrep: undefined;
  /** Modal: contacts-match + invite flow. */
  FindFriends: undefined;
  /** Modal: discover + request mentors in your trade. */
  Mentors: undefined;
  /** Modal: compose a new Community post (feed). */
  CommunityComposer:
    | { type?: 'text' | 'photo' | 'video' | 'certificate' | 'resume' | 'voice' }
    | undefined;
  /** Modal: a Community post with its full comment thread. */
  CommunityPost: { postId: string };
  /** Modal: apply for a small cash advance. */
  Advance: undefined;
  /** Modal: opt-in for worker accident cover. */
  Insurance: undefined;
  /** Modal: same-day Tinder-style swipe deck for Today-mode jobs. */
  JobSwipe: undefined;
  /**
   * Modal: Festival Mode job board — jobs in the trades that spike for
   * the currently-active festival. Reached from the Home festival banner.
   */
  FestivalJobs: undefined;
  /**
   * Modal: choose where the Jobs list searches — the worker's own
   * location, or any city / area they pick.
   */
  LocationPicker: undefined;
  /**
   * Modal: admin-only WhatsApp support inbox. Lists inbound message
   * threads from Doondo's WhatsApp Business number, lets staff send
   * freeform replies inside the 24-hour window. Backend enforces the
   * admin role; the screen also hides itself for non-admins.
   */
  WhatsAppInbox: undefined;
  /**
   * Modal: add a second account (Instagram-style switcher target).
   * Lives in AppStack because the user is already authenticated when
   * they open it — auth.addAccount() pushes the new account into
   * savedAccounts and switches without ejecting the original session.
   *
   * `role` locks the form to that role (no toggle) — defaults to
   * 'employer' since the seeker profile's switcher is the primary
   * entry point.
   */
  AddAccountSignup: { role?: UserRole } | undefined;
  /**
   * Password-reset screens are ALSO registered in the AppStack (not just
   * AuthStack) so a signed-in user on AddAccountSignup who hits the
   * AUTH_EMAIL_TAKEN error can recover the other account without losing
   * their current session first. Same param shapes as their AuthStack
   * counterparts.
   */
  ForgotPassword: undefined;
  ForgotPasswordCode: { phone: string; expiresAt: string };
  ResetPassword: { phone: string; resetToken: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList
      extends AuthStackParamList,
        AppStackParamList,
        SeekerTabParamList,
        EmployerTabParamList {}
  }
}

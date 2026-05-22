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
  /** Conversations list. */
  Chat: undefined;
  /** Profile — verified badge, rating, salary, skills, menu. */
  Profile: undefined;
};

export type EmployerTabParamList = {
  Posts: undefined;
  Applicants: undefined;
  Chat: undefined;
  EmployerProfile: undefined;
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
  /** Modal: a single applicant — full seeker profile + actions. */
  ApplicantDetail: { applicationId: string };
  /** Modal: post a new job (employer). */
  PostJob: undefined;
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
  /** Modal: voice-driven job search (legacy speech-to-textbox screen). */
  VoiceSearch: undefined;
  /**
   * Modal: the conversational voice job-search agent — speak a search,
   * hear the results read back, apply by voice. Pushed by the center
   * FAB mic; supersedes the older VoiceSearch screen.
   */
  VoiceAgent: undefined;
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
  /** Modal: saved + applied jobs in one screen. */
  MyJobs: undefined;
  /** Modal: pick an application to start a chat from (seeker). */
  NewChat: undefined;
  /** Modal: settings — language, notifications, theme, account. */
  Settings: undefined;
  /** Modal: seeker earnings ledger. */
  MyEarnings: undefined;
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
  /** Modal: catalogue of training courses. */
  Courses: undefined;
  /** Modal: a single course with its lessons + progress + enroll CTA. */
  CourseDetail: { courseId: string };
  /** Modal: skill assessments — catalogue + take-test flow. */
  SkillTests: undefined;
  /** Modal: the worker's portable, verified Skill Passport. */
  SkillPassport: undefined;
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
  /** Modal: apply for a small cash advance. */
  Advance: undefined;
  /** Modal: opt-in for worker accident cover. */
  Insurance: undefined;
  /** Modal: same-day Tinder-style swipe deck for Today-mode jobs. */
  JobSwipe: undefined;
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

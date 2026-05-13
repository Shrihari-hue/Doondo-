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

import type { UserRole } from '@/api/types';
import type { WorkType } from '@/api/types';

export type AuthStackParamList = {
  RolePicker: undefined;
  Welcome: undefined;
  Login: undefined;
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
  /** Modal: full-screen job detail with apply CTA (seeker view). */
  JobDetail: { jobId: string };
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
  /** Modal: voice-driven job search. Pushed by the center FAB mic. */
  VoiceSearch: undefined;
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

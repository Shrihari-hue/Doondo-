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
  ForgotPassword: undefined;
};

export type SeekerTabParamList = {
  Jobs: undefined;
  Saved: undefined;
  Applications: undefined;
  Chat: undefined;
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

/**
 * AppNavigator — shown when the user is authenticated.
 *
 * Routes by user.role:
 *   - seeker   → SeekerTabNavigator
 *   - employer → EmployerTabNavigator
 *
 * Modal screens (JobDetail, JobApplicants, ApplicantDetail, PostJob,
 * EditProfile) stack on top of whichever tab host is active.
 */

import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useApplicationSocket } from '@/hooks/useApplicationSocket';
import { useChatSocket } from '@/hooks/useChatSocket';
import { useOfflineQueueSync } from '@/hooks/useOfflineQueue';
import {
  attachTapHandler,
  registerForPushNotifications,
  setupNotificationHandlers,
} from '@/lib/push';
import { SeekerTabNavigator } from './SeekerTabNavigator';
import { EmployerTabNavigator } from './EmployerTabNavigator';
import { JobDetailScreen } from '@/screens/seeker/JobDetailScreen';
import { EditProfileScreen } from '@/screens/seeker/EditProfileScreen';
import { VoiceAgentScreen } from '@/screens/seeker/VoiceAgentScreen';
import { WomenHubScreen } from '@/screens/seeker/WomenHubScreen';
import { RecordReelScreen } from '@/screens/seeker/RecordReelScreen';
import { ReelFeedScreen } from '@/screens/employer/ReelFeedScreen';
import { RatingsScreen } from '@/screens/seeker/RatingsScreen';
import { LeaveRatingScreen } from '@/screens/seeker/LeaveRatingScreen';
import { NotificationsScreen } from '@/screens/seeker/NotificationsScreen';
import { EditExpectedSalaryScreen } from '@/screens/seeker/EditExpectedSalaryScreen';
import { MyApplicationsScreen } from '@/screens/seeker/MyApplicationsScreen';
import { MyJobScreen } from '@/screens/seeker/MyJobScreen';
import { MyEmployerJobScreen } from '@/screens/seeker/MyEmployerJobScreen';
import { MyJobsScreen } from '@/screens/seeker/MyJobsScreen';
import { NewChatScreen } from '@/screens/chat/NewChatScreen';
import { SettingsScreen } from '@/screens/seeker/SettingsScreen';
import { MyEarningsScreen } from '@/screens/seeker/MyEarningsScreen';
import { CollectScreen } from '@/screens/seeker/CollectScreen';
import { DownloadCenterScreen } from '@/screens/seeker/DownloadCenterScreen';
import { EmployerDetailScreen } from '@/screens/seeker/EmployerDetailScreen';
import { SosScreen } from '@/screens/seeker/SosScreen';
import { TrustCircleScreen } from '@/screens/seeker/TrustCircleScreen';
import { ProfileFromPhotoScreen } from '@/screens/seeker/ProfileFromPhotoScreen';
import { ResumeBuilderScreen } from '@/screens/seeker/ResumeBuilderScreen';
import { ResumePreviewScreen } from '@/screens/seeker/ResumePreviewScreen';
import { TailoredResumeScreen } from '@/screens/seeker/TailoredResumeScreen';
import { FestivalJobsScreen } from '@/screens/seeker/FestivalJobsScreen';
import { LocationPickerScreen } from '@/screens/seeker/LocationPickerScreen';
import { JobAlertsScreen } from '@/screens/seeker/JobAlertsScreen';
import { JobAlertFormScreen } from '@/screens/seeker/JobAlertFormScreen';
import { AvailableWorkersScreen } from '@/screens/employer/AvailableWorkersScreen';
import { WorkforceScreen } from '@/screens/employer/WorkforceScreen';
import { SendHiringRequestScreen } from '@/screens/employer/SendHiringRequestScreen';
import { SentHiringRequestsScreen } from '@/screens/employer/SentHiringRequestsScreen';
import { InterestedWorkersScreen } from '@/screens/employer/InterestedWorkersScreen';
import { HiringRequestsScreen } from '@/screens/seeker/HiringRequestsScreen';
import { CoursesScreen } from '@/screens/seeker/CoursesScreen';
import { CourseDetailScreen } from '@/screens/seeker/CourseDetailScreen';
import { SkillTestsScreen } from '@/screens/seeker/SkillTestsScreen';
import { SkillPassportScreen } from '@/screens/seeker/SkillPassportScreen';
import { ScoreCredentialScreen } from '@/screens/seeker/ScoreCredentialScreen';
import { ConstitutionScreen } from '@/screens/seeker/ConstitutionScreen';
import { CareerPathScreen } from '@/screens/seeker/CareerPathScreen';
import { PayslipExplainerScreen } from '@/screens/seeker/PayslipExplainerScreen';
import { InterviewPrepScreen } from '@/screens/seeker/InterviewPrepScreen';
import { FindFriendsScreen } from '@/screens/seeker/FindFriendsScreen';
import { MentorsScreen } from '@/screens/seeker/MentorsScreen';
import { PostComposerScreen } from '@/screens/community/PostComposerScreen';
import { CommunityPostScreen } from '@/screens/community/CommunityPostScreen';
import { AdvanceScreen } from '@/screens/seeker/AdvanceScreen';
import { InsuranceScreen } from '@/screens/seeker/InsuranceScreen';
import { JobSwipeScreen } from '@/screens/seeker/JobSwipeScreen';
import { AddAccountSignupScreen } from '@/screens/auth/AddAccountSignupScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { ForgotPasswordCodeScreen } from '@/screens/auth/ForgotPasswordCodeScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { WhatsAppInboxScreen } from '@/screens/admin/WhatsAppInboxScreen';
import { JobApplicantsScreen } from '@/screens/employer/JobApplicantsScreen';
import { ApplicantDetailScreen } from '@/screens/employer/ApplicantDetailScreen';
import { PostJobScreen } from '@/screens/employer/PostJobScreen';
import { ConversationScreen } from '@/screens/chat/ConversationScreen';
import { VerificationFlowScreen } from '@/screens/verification/VerificationFlowScreen';
import { AddRecoveryPhoneScreen } from '@/screens/settings/AddRecoveryPhoneScreen';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isEmployer = user?.role === 'employer';

  // Live application status updates + chat events over Socket.IO.
  // Mounted here so the listeners follow the full authenticated session.
  useApplicationSocket();
  useChatSocket();

  // Flush any applications queued while offline — on mount and every
  // time the app returns to the foreground.
  useOfflineQueueSync();

  // Push notifications — request permission, register the Expo token,
  // and subscribe to taps so a notification tap lands the user on the
  // right screen (server-driven via the `deeplink` field on every push
  // payload). The tap handler also catches the cold-boot case where
  // the user opens the app FROM a notification on the home screen.
  useEffect(() => {
    void setupNotificationHandlers();
    void registerForPushNotifications();
    const unsubscribe = attachTapHandler();
    return unsubscribe;
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.canvas },
        animation: 'fade',
      }}
    >
      {isEmployer ? (
        <Stack.Screen name="EmployerTabs" component={EmployerTabNavigator} />
      ) : (
        <Stack.Screen name="SeekerTabs" component={SeekerTabNavigator} />
      )}

      {/* Seeker modals */}
      <Stack.Screen
        name="JobDetail"
        component={JobDetailScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />

      {/* Employer modals */}
      <Stack.Screen
        name="JobApplicants"
        component={JobApplicantsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ApplicantDetail"
        component={ApplicantDetailScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MyEmployerJob"
        component={MyEmployerJobScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PostJob"
        component={PostJobScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />

      {/* Chat modal — shared by both roles */}
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ presentation: 'modal', animation: 'slide_from_right' }}
      />

      {/* Shared modals */}
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Verification"
        component={VerificationFlowScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="AddRecoveryPhone"
        component={AddRecoveryPhoneScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />

      {/* Seeker Phase 2 redesign modals */}
      <Stack.Screen
        name="VoiceAgent"
        component={VoiceAgentScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="WomenHub"
        component={WomenHubScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="RecordReel"
        component={RecordReelScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ReelFeed"
        component={ReelFeedScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Ratings"
        component={RatingsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="LeaveRating"
        component={LeaveRatingScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="EditExpectedSalary"
        component={EditExpectedSalaryScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MyApplications"
        component={MyApplicationsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MyJob"
        component={MyJobScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MyJobs"
        component={MyJobsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="MyEarnings"
        component={MyEarningsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Collect"
        component={CollectScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="DownloadCenter"
        component={DownloadCenterScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="EmployerDetail"
        component={EmployerDetailScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Sos"
        component={SosScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="TrustCircle"
        component={TrustCircleScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ProfileFromPhoto"
        component={ProfileFromPhotoScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ResumeBuilder"
        component={ResumeBuilderScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ResumePreview"
        component={ResumePreviewScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="TailoredResume"
        component={TailoredResumeScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="FestivalJobs"
        component={FestivalJobsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="LocationPicker"
        component={LocationPickerScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="JobAlerts"
        component={JobAlertsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="JobAlertForm"
        component={JobAlertFormScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="AvailableWorkers"
        component={AvailableWorkersScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Workforce"
        component={WorkforceScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SendHiringRequest"
        component={SendHiringRequestScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="HiringRequests"
        component={HiringRequestsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SentHiringRequests"
        component={SentHiringRequestsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="InterestedWorkers"
        component={InterestedWorkersScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Courses"
        component={CoursesScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CourseDetail"
        component={CourseDetailScreen}
        options={{ presentation: 'modal', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SkillTests"
        component={SkillTestsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SkillPassport"
        component={SkillPassportScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="ScoreCredential"
        component={ScoreCredentialScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Constitution"
        component={ConstitutionScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CareerPath"
        component={CareerPathScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="PayslipExplainer"
        component={PayslipExplainerScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="InterviewPrep"
        component={InterviewPrepScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="FindFriends"
        component={FindFriendsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Mentors"
        component={MentorsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CommunityComposer"
        component={PostComposerScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CommunityPost"
        component={CommunityPostScreen}
        options={{ presentation: 'modal', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="Advance"
        component={AdvanceScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Insurance"
        component={InsuranceScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="JobSwipe"
        component={JobSwipeScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="AddAccountSignup"
        component={AddAccountSignupScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      {/* Password-reset screens registered in the AppStack too — needed so
          a SIGNED-IN user on AddAccountSignup who hits AUTH_EMAIL_TAKEN
          can tap "Forgot password" and recover the other account without
          having to log out first. After a successful reset the backend
          revokes every refresh token for the affected user(s), so the
          API client's next call force-logs them out and they land back
          on the AuthStack to sign in fresh. */}
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen
        name="ForgotPasswordCode"
        component={ForgotPasswordCodeScreen}
      />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen
        name="WhatsAppInbox"
        component={WhatsAppInboxScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

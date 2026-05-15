/**
 * AuthNavigator — pre-auth screen stack.
 *
 * First launch on a fresh install? We show the OnboardingScreen
 * walkthrough as the initial route. Once dismissed (or completed),
 * a flag in expo-secure-store keeps the user out of it forever.
 *
 * Because the flag lives on disk we can't decide the initialRouteName
 * synchronously — we read it once on mount and gate the navigator
 * behind a tiny splash. The check is fast (single SecureStore read);
 * the splash is invisible in practice on a real device.
 */

import { useEffect, useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingScreen, hasSeenOnboarding } from '@/screens/auth/OnboardingScreen';
import { RolePickerScreen } from '@/screens/auth/RolePickerScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignupScreen } from '@/screens/auth/SignupScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { ForgotPasswordCodeScreen } from '@/screens/auth/ForgotPasswordCodeScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { theme } = useTheme();
  const [initialRoute, setInitialRoute] = useState<
    keyof AuthStackParamList | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await hasSeenOnboarding();
      if (cancelled) return;
      setInitialRoute(seen ? 'RolePicker' : 'Onboarding');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (initialRoute === null) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen name="RolePicker" component={RolePickerScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ForgotPasswordCode" component={ForgotPasswordCodeScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}

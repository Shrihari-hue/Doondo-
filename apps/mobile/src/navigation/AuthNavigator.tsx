import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RolePickerScreen } from '@/screens/auth/RolePickerScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignupScreen } from '@/screens/auth/SignupScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { useTheme } from '@/theme/useTheme';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator
      initialRouteName="RolePicker"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="RolePicker" component={RolePickerScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

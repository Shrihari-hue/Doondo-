import './global.css';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';

import { themes } from '@doondo/tokens';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/useTheme';
import { RootNavigator } from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/ref';
import { queryClient } from '@/lib/queryClient';
import { setAuthAdapter } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { AccessibilityProvider } from '@/lib/accessibility';

// ─── Pre-React boot work ─────────────────────────────────────────────────────

SplashScreen.preventAutoHideAsync().catch(() => {
  // already prevented
});

SystemUI.setBackgroundColorAsync(themes.dark.bg.canvas).catch(() => {
  // best-effort
});

// Wire the API client's auth adapter to the Zustand store. The client never
// imports the store directly — keeps the dependency one-way and unit-testable.
setAuthAdapter({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: async (accessToken, refreshToken) => {
    await useAuthStore.getState().updateTokens(accessToken, refreshToken);
  },
  onAuthFailure: async () => {
    await useAuthStore.getState().forceLogout();
  },
});

// ─── App tree ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: themes.dark.bg.canvas }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <LanguageProvider>
              <AccessibilityProvider>
                <ThemedAppShell />
              </AccessibilityProvider>
            </LanguageProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedAppShell() {
  const { theme, scheme } = useTheme();

  // Kick off auth bootstrap on first render. The store transitions
  // bootstrapping → authenticated | unauthenticated based on what's in
  // the secure keychain.
  useAuthBootstrap();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    dark: scheme === 'dark',
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg.canvas,
      card: theme.bg.surface,
      text: theme.text.primary,
      border: theme.border.default,
      primary: theme.brand.primary,
      notification: theme.brand.primary,
    },
  };

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

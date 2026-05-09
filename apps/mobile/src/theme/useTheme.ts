import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import type { ThemeContextValue } from './types';

/**
 * Access the active theme tokens. Must be used inside <ThemeProvider>.
 *
 * Example:
 *   const { theme } = useTheme();
 *   <View style={{ backgroundColor: theme.bg.canvas }} />
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

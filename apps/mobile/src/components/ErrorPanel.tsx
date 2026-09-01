/**
 * ErrorPanel — friendly error state with a retry button.
 *
 * Use anywhere a query fails. Inspects the error shape (ApiError vs.
 * plain Error vs. unknown) to choose the right copy:
 *   - Network → "Check your connection"
 *   - 401 → "Sign in again"
 *   - 5xx → "Our servers are having a moment"
 *   - default → message from the error or a generic line
 */
import { Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { ApiError } from '@/api/errors';

interface Props {
  error: unknown;
  onRetry?: () => void;
  /** When true, render compact (just a row), not a card. Default false. */
  compact?: boolean;
  /** Custom title override. */
  title?: string;
}

interface Copy {
  glyph: string;
  title: string;
  body: string;
  cta: string;
}

function deriveCopy(err: unknown): Copy {
  // ApiError carries an HTTP status + a server message.
  if (err instanceof ApiError) {
    if (err.status === 0) {
      return {
        glyph: '📡',
        title: "You're offline",
        body: 'Check your internet connection and try again.',
        cta: 'Try again',
      };
    }
    if (err.status === 401 || err.status === 403) {
      return {
        glyph: '🔒',
        title: "You're signed out",
        body: 'Your session expired. Sign in to continue.',
        cta: 'Sign in',
      };
    }
    if (err.status >= 500) {
      return {
        glyph: '🛠',
        title: 'Our servers are having a moment',
        body: 'This is on us, not you. Try again in a few seconds.',
        cta: 'Retry',
      };
    }
    if (err.status === 404) {
      return {
        glyph: '🔍',
        title: "Couldn't find it",
        body: 'The page or item you were looking for is no longer here.',
        cta: 'Go back',
      };
    }
    return {
      glyph: '⚠️',
      title: "Something didn't go to plan",
      body: err.message || 'Try again, or come back in a bit.',
      cta: 'Retry',
    };
  }
  if (err instanceof TypeError) {
    return {
      glyph: '📡',
      title: 'Connection trouble',
      body: 'We couldn\'t reach the server. Check your signal and try again.',
      cta: 'Retry',
    };
  }
  return {
    glyph: '⚠️',
    title: "Something didn't load",
    body:
      err instanceof Error
        ? err.message
        : "We're not sure what happened. Pull down to refresh and try again.",
    cta: 'Retry',
  };
}

export function ErrorPanel({ error, onRetry, compact = false, title }: Props) {
  const { theme } = useTheme();
  const copy = deriveCopy(error);
  const finalTitle = title ?? copy.title;

  if (compact) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radii.md,
          borderWidth: 0.5,
          borderColor: theme.status.dangerBorder,
          backgroundColor: theme.status.dangerSubtle,
        }}
      >
        <Text style={{ fontSize: 16 }}>{copy.glyph}</Text>
        <Text style={{ flex: 1, fontSize: 13, color: theme.status.danger }}>{finalTitle}</Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: 4 }}
          >
            <Text style={{ color: theme.status.danger, fontSize: 13, fontWeight: '700' }}>
              {copy.cta}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.xl,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        backgroundColor: theme.bg.surface,
      }}
    >
      <Text style={{ fontSize: 36 }}>{copy.glyph}</Text>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: theme.text.primary,
          textAlign: 'center',
        }}
      >
        {finalTitle}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: theme.text.secondary,
          textAlign: 'center',
          lineHeight: 19,
          paddingHorizontal: spacing.md,
        }}
      >
        {copy.body}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => ({
            marginTop: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.sm + 2,
            borderRadius: radii.pill,
            backgroundColor: theme.brand.primary,
            opacity: pressed ? 0.85 : 1,
            shadowColor: theme.brand.primaryPressed,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
            elevation: 4,
          })}
        >
          <Text style={{ color: theme.text.onBrand, fontWeight: '700', fontSize: 14 }}>
            {copy.cta}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

import { View } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

interface Props {
  /** The error message to display. Render nothing if null/empty. */
  message: string | null | undefined;
}

/**
 * FormError — banner-style error displayed at the top of forms when the
 * server rejects with a non-field error (invalid credentials, email taken,
 * rate limited, network down).
 *
 * Field-level errors should use the `error` prop on TextField, not this.
 */
export function FormError({ message }: Props) {
  const { theme } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        backgroundColor: theme.status.dangerSubtle,
        borderColor: theme.status.dangerBorder,
        borderWidth: 0.5,
        borderRadius: radii.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text variant="footnote" tone="danger" weight="medium">
        {message}
      </Text>
    </View>
  );
}

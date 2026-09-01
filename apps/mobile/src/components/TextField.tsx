import { useState, forwardRef } from 'react';
import { TextInput, View, type TextInputProps, Pressable } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

interface Props extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  helper?: string;
  error?: string | null;
  /**
   * Right-side affordance — a "Show / Hide" toggle for password fields.
   * If you pass this, the input renders with secureTextEntry that toggles
   * via the affordance.
   */
  passwordToggle?: boolean;
  /** Additional content rendered to the right of the input (icon, etc). */
  trailing?: React.ReactNode;
}

/**
 * TextField — themed input with label, helper text, and inline error.
 *
 * Always reach for this instead of <TextInput> in screens. It centralises
 * focus styling, error state coloring, and the password reveal pattern.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, helper, error, passwordToggle = false, trailing, ...inputProps },
  ref,
) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const hasError = Boolean(error);
  const borderColor = hasError
    ? theme.status.danger
    : focused
      ? theme.border.focus
      : theme.border.default;

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="footnote" weight="medium" tone="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.bg.surface,
          borderColor,
          borderWidth: 0.5,
          borderRadius: radii.button, // design/components.md TextInput: 14-16px
          paddingHorizontal: spacing.lg, // design/components.md TextInput: 16px
          minHeight: 52, // design/components.md TextInput: 52-56px
        }}
      >
        <TextInput
          ref={ref}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          secureTextEntry={passwordToggle ? !revealed : inputProps.secureTextEntry}
          placeholderTextColor={theme.text.tertiary}
          style={{
            flex: 1,
            color: theme.text.primary,
            fontSize: 16, // larger inputs feel premium and reduce keyboard zoom on iOS
            paddingVertical: spacing.sm,
          }}
        />
        {passwordToggle ? (
          <Pressable hitSlop={8} onPress={() => setRevealed((v) => !v)}>
            <Text variant="footnote" weight="medium" tone="secondary">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        ) : null}
        {trailing}
      </View>

      {hasError ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="footnote" tone="tertiary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

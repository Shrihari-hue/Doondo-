import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

export interface HireShareCardInput {
  targetRef: RefObject<View | null>;
  caption?: string;
  dialogTitle?: string;
}

export interface HireShareCardResult {
  ok: true;
  uri: string;
}

export interface HireShareCardFailure {
  ok: false;
  reason: 'unsupported' | 'missing_target' | 'denied' | 'failed';
  message: string;
}

export async function captureHireShareCard(
  input: HireShareCardInput,
): Promise<HireShareCardResult | HireShareCardFailure> {
  if (!input.targetRef.current) {
    return {
      ok: false,
      reason: 'missing_target',
      message: 'Share card is not ready yet.',
    };
  }

  try {
    // Give React one frame so the hidden poster is fully laid out before capture.
    await new Promise((resolve) => setTimeout(resolve, 32));
    const uri = await captureRef(input.targetRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : 'Could not generate the share card.',
    };
  }
}

export async function shareHireShareCard(
  input: HireShareCardInput,
): Promise<HireShareCardResult | HireShareCardFailure> {
  if (!(await Sharing.isAvailableAsync())) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Sharing is not available on this device.',
    };
  }

  const captured = await captureHireShareCard(input);
  if (!captured.ok) return captured;

  try {
    await Sharing.shareAsync(captured.uri, {
      mimeType: 'image/png',
      dialogTitle: input.dialogTitle ?? 'Share hire celebration',
      UTI: 'public.png',
    });

    if (input.caption?.trim()) {
      await Clipboard.setStringAsync(input.caption.trim());
    }
    return captured;
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : 'Could not share the card.',
    };
  }
}

export async function saveHireShareCardToPhotos(
  input: HireShareCardInput,
): Promise<HireShareCardResult | HireShareCardFailure> {
  const captured = await captureHireShareCard(input);
  if (!captured.ok) return captured;

  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        reason: 'denied',
        message: 'Photo library permission was not granted.',
      };
    }
    await MediaLibrary.saveToLibraryAsync(captured.uri);
    return captured;
  } catch (err) {
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error ? err.message : 'Could not save the card.',
    };
  }
}

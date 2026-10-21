/**
 * Call the other party on a hire through Doondo's masked-call flow.
 * Dials a proxy number when a telephony provider is configured; otherwise
 * the backend returns the real number (gated to hire parties only).
 */
import { Alert, Linking } from 'react-native';
import { maskedCallApi } from '@/api/maskedCall.api';
import { haptic } from '@/lib/haptics';

export async function callViaDoondo(applicationId: string): Promise<void> {
  haptic('selection');
  try {
    const res = await maskedCallApi.start(applicationId);
    if (!res.dialNumber) {
      Alert.alert('No number', "This worker hasn't added a phone number yet.");
      return;
    }
    await Linking.openURL(`tel:${res.dialNumber}`);
  } catch {
    haptic('error');
    Alert.alert('Could not start the call', 'Please check your connection and try again.');
  }
}

/**
 * Worker-safety helpers for the SOS feature.
 *
 * The emergency contact is stored on-device only (expo-secure-store) and
 * is never sent to the Doondo backend. When the seeker triggers SOS we
 * open the device's SMS composer prefilled with a help message and the
 * user's last known coordinates — leaving the actual send/cancel decision
 * to the user. We do NOT make any silent calls or background sends; that
 * would be both unsafe (false alarms) and a privacy issue.
 */

import { Linking, Platform } from 'react-native';
import { getSecure, setSecure, deleteSecure } from './secureStore';
import { getCurrentCoords, type Coords } from './location';

export interface SosContact {
  name: string;
  phone: string;
}

const KEY = 'sosContact' as const;

export async function getSosContact(): Promise<SosContact | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SosContact>;
    if (typeof parsed.name === 'string' && typeof parsed.phone === 'string') {
      return { name: parsed.name, phone: parsed.phone };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSosContact(contact: SosContact): Promise<void> {
  await setSecure(KEY, JSON.stringify(contact));
}

export async function clearSosContact(): Promise<void> {
  await deleteSecure(KEY);
}

/**
 * Build the SMS body. Coordinates are formatted as a Google Maps URL the
 * recipient can tap to see exactly where the seeker is.
 */
export function buildSosMessage(opts: {
  senderName: string;
  coords: Coords | null;
}): string {
  const parts: string[] = [
    `🚨 SOS from ${opts.senderName} on Doondo.`,
    'I need help right now. Please contact me.',
  ];
  if (opts.coords) {
    const { lat, lng } = opts.coords;
    parts.push(`My location: https://maps.google.com/?q=${lat},${lng}`);
  } else {
    parts.push('My location is unavailable right now.');
  }
  return parts.join('\n');
}

/**
 * Trigger SOS — fetch coords, then open the SMS composer with the message
 * pre-filled. Resolves with `{opened: true}` on success.
 *
 * iOS and Android use different sms: URI conventions for the body
 * parameter, so we branch on Platform.OS.
 */
export async function triggerSos(opts: {
  contact: SosContact;
  senderName: string;
}): Promise<{ opened: boolean; reason?: string }> {
  let coords: Coords | null = null;
  try {
    coords = await getCurrentCoords();
  } catch {
    coords = null;
  }
  const body = buildSosMessage({ senderName: opts.senderName, coords });
  const encoded = encodeURIComponent(body);
  // Strip everything but digits and a leading +.
  const phone = opts.contact.phone.replace(/[^\d+]/g, '');
  const url =
    Platform.OS === 'ios'
      ? `sms:${phone}&body=${encoded}`
      : `sms:${phone}?body=${encoded}`;

  const can = await Linking.canOpenURL(url);
  if (!can) {
    return { opened: false, reason: "This device can't open SMS." };
  }
  await Linking.openURL(url);
  return { opened: true };
}

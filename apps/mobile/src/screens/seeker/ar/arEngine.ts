/**
 * AR engine — device pose + geo projection for the AR job view.
 *
 *   - useArPose(): the device's position (GPS), heading (compass) and
 *     pitch/roll (gravity via expo-sensors DeviceMotion), smoothed and
 *     published at ~20 fps.
 *   - project(): pinhole-camera projection of a point given in metres
 *     east/north/up of the viewer, using the phone camera's field of view.
 *
 * DeviceMotion is optional: if the installed native build predates
 * expo-sensors, the module is missing and pose falls back to compass-only
 * (pitch = roll = 0) instead of crashing.
 *
 * Depth is stylised: callers place points on a "virtual ground" whose
 * distance is compressed (sqrt), so near jobs sit low and big while far
 * ones sit near the horizon. Left/right is always the true bearing.
 * Building-level anchoring needs ARCore Geospatial and is a later step.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

interface Vec3 { x: number; y: number; z: number }
interface DeviceMotionLike {
  isAvailableAsync(): Promise<boolean>;
  setUpdateInterval(ms: number): void;
  addListener(cb: (e: { accelerationIncludingGravity?: Vec3 | null }) => void): { remove(): void };
}
let DeviceMotion: DeviceMotionLike | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DeviceMotion = require('expo-sensors').DeviceMotion as DeviceMotionLike;
} catch {
  DeviceMotion = null;
}

export interface LatLng { lat: number; lng: number }
export interface Pose { yaw: number; pitch: number; roll: number }
export interface ScreenPt { x: number; y: number; depth: number }

/** Vertical field of view of a phone's main camera preview in portrait. */
export const VFOV_DEG = 62;
/** Height of the virtual eye above the virtual ground (m). */
export const EYE_M = 4;

export const toRad = (d: number) => (d * Math.PI) / 180;
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function bearingRad(from: LatLng, to: LatLng): number {
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return Math.atan2(y, x);
}

export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compressed ground distance — near jobs low/big, far ones at the horizon. */
export const virtualGround = (m: number) => 6 + 30 * Math.sqrt(m / 1000);

export const groundPoint = (bearing: number, vd: number) => ({
  e: Math.sin(bearing) * vd,
  n: Math.cos(bearing) * vd,
  u: -EYE_M,
});

/** Project an ENU point (metres from the eye) to screen pixels; null if behind. */
export function project(
  p: { e: number; n: number; u: number },
  pose: Pose,
  W: number,
  H: number,
  focal: number,
): ScreenPt | null {
  const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const depth = p.e * sy * cp + p.n * cy * cp + p.u * sp;
  if (depth < 0.5) return null;
  const xs = (p.e * cy - p.n * sy) / depth;
  const ys = (-p.e * sy * sp - p.n * cy * sp + p.u * cp) / depth;
  const cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);
  const right = xs * cr + ys * sr;
  const up = -xs * sr + ys * cr;
  return { x: W / 2 + right * focal, y: H / 2 - up * focal, depth };
}

export const focalFor = (H: number) => H / 2 / Math.tan(toRad(VFOV_DEG / 2));

export function useArPose() {
  const [me, setMe] = useState<LatLng | null>(null);
  const [locError, setLocError] = useState(false);
  const [pose, setPose] = useState<Pose | null>(null);
  const headingRef = useRef<number | null>(null);
  const gravityRef = useRef<Vec3 | null>(null);
  const gravitySign = useRef(Platform.OS === 'android' ? 1 : -1);

  const fix = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError(true);
        return false;
      }
      setLocError(false);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      return true;
    } catch {
      setLocError(true);
      return false;
    }
  }, []);

  // Position + heading.
  useEffect(() => {
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      if (!(await fix()) || cancelled) return;
      posSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15 },
        (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      );
      headSub = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        headingRef.current = toRad(deg);
      });
    })();
    return () => {
      cancelled = true;
      posSub?.remove();
      headSub?.remove();
    };
  }, [fix]);

  // Gravity → pitch/roll.
  useEffect(() => {
    if (!DeviceMotion) return;
    let sub: { remove(): void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!(await DeviceMotion!.isAvailableAsync()) || cancelled) return;
        DeviceMotion!.setUpdateInterval(40);
        sub = DeviceMotion!.addListener((e) => {
          if (e.accelerationIncludingGravity) gravityRef.current = e.accelerationIncludingGravity;
        });
      } catch {
        /* compass-only */
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // Smooth + publish.
  useEffect(() => {
    const s = { yaw: 0, pitch: 0, roll: 0, ready: false };
    const id = setInterval(() => {
      const heading = headingRef.current;
      if (heading == null) return;
      let pitch = 0;
      let roll = 0;
      const g = gravityRef.current;
      if (g) {
        const mag = Math.hypot(g.x, g.y, g.z) || 1;
        // Sign conventions differ by platform; learn it while the phone
        // is held upright (y dominant), assuming it isn't upside down.
        if (Math.abs(g.y) / mag > 0.7) gravitySign.current = Math.sign(g.y) || 1;
        const k = gravitySign.current / mag;
        const u = { x: g.x * k, y: g.y * k, z: g.z * k }; // world-up in device coords
        pitch = Math.asin(Math.max(-1, Math.min(1, -u.z)));
        roll = Math.atan2(u.x, u.y);
      }
      if (!s.ready) Object.assign(s, { yaw: heading, pitch, roll, ready: true });
      else {
        s.yaw = wrapPi(s.yaw + wrapPi(heading - s.yaw) * 0.25);
        s.pitch += (pitch - s.pitch) * 0.3;
        s.roll = wrapPi(s.roll + wrapPi(roll - s.roll) * 0.3);
      }
      setPose({ yaw: s.yaw, pitch: s.pitch, roll: s.roll });
    }, 50);
    return () => clearInterval(id);
  }, []);

  return { me, pose, locError, refresh: fix };
}

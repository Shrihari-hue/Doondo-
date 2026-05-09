#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * sync-mobile-env — auto-detects the Mac's LAN IP and writes
 * apps/mobile/.env so EXPO_PUBLIC_API_URL and EXPO_PUBLIC_SOCKET_URL
 * always point at the right address for the current Wi-Fi.
 *
 * Run automatically before `pnpm dev:mobile` (wired in package.json).
 *
 * Heuristic: pick the first non-internal IPv4 from os.networkInterfaces()
 * that's a private LAN range (192.168.*, 10.*, 172.16-31.*). Skip
 * loopback and IPv6. Prefer en0 (Wi-Fi on Mac) when multiple match.
 *
 * If no LAN IP is found (e.g. machine offline), we don't touch .env —
 * better to leave the last good value than write a useless localhost.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, 'apps', 'mobile', '.env');

const PORT = process.env.DOONDO_API_PORT || '4000';
const API_VERSION = process.env.DOONDO_API_VERSION || 'v1';

function detectLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4') continue;
      if (a.internal) continue;
      if (!isPrivate(a.address)) continue;
      candidates.push({ name, address: a.address });
    }
  }

  if (candidates.length === 0) return null;

  // Prefer en0 (Mac Wi-Fi) → en1 → first match.
  const en0 = candidates.find((c) => c.name === 'en0');
  if (en0) return en0.address;
  const en1 = candidates.find((c) => c.name === 'en1');
  if (en1) return en1.address;
  return candidates[0].address;
}

function isPrivate(ip) {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function main() {
  const ip = detectLanIp();
  if (!ip) {
    console.warn('[sync-mobile-env] no LAN IP found — keeping existing .env');
    return;
  }

  const apiUrl = `http://${ip}:${PORT}`;

  const lines = [
    `EXPO_PUBLIC_API_URL=${apiUrl}`,
    `EXPO_PUBLIC_API_VERSION=${API_VERSION}`,
    `EXPO_PUBLIC_SOCKET_URL=${apiUrl}`,
    '',
  ];
  const next = lines.join('\n');

  // Avoid touching the file if nothing changed (keeps mtime stable so
  // Metro doesn't think anything has been edited).
  let prev = '';
  try {
    prev = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    // file may not exist yet
  }

  if (prev === next) {
    console.log(`[sync-mobile-env] .env already up-to-date (${apiUrl})`);
    return;
  }

  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  fs.writeFileSync(ENV_PATH, next);
  console.log(`[sync-mobile-env] wrote ${apiUrl} into apps/mobile/.env`);
}

main();

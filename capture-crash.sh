#!/usr/bin/env bash
#
# capture-crash.sh — grabs the Android crash log for the Doondo app.
#
# Usage:
#   1. Plug your Android phone into the Mac with a USB cable.
#   2. On the phone, enable Developer Options + USB debugging:
#        Settings > About phone > tap "Build number" 7 times
#        Settings > Developer options > turn on "USB debugging"
#   3. In Terminal:  bash capture-crash.sh
#   4. When it says so, open the Doondo app and let it crash.
#   5. Send the file it writes to your Desktop.
#
set -u

APP_ID="com.doondo.app"     # from app.json -> android.package
# Save inside the project folder so Claude can read it directly.
OUT="$(cd "$(dirname "$0")" && pwd)/doondo-crash.txt"

# --- locate adb -------------------------------------------------------------
ADB="$(command -v adb || true)"
for guess in "$HOME/Library/Android/sdk/platform-tools/adb" \
             "/opt/homebrew/bin/adb" "/usr/local/bin/adb"; do
  [ -z "$ADB" ] && [ -x "$guess" ] && ADB="$guess"
done
if [ -z "$ADB" ]; then
  echo "adb not found."
  echo "Install it with Homebrew:   brew install --cask android-platform-tools"
  echo "or download 'SDK Platform-Tools' from:"
  echo "  https://developer.android.com/tools/releases/platform-tools"
  exit 1
fi
echo "Using adb: $ADB"

# --- wait for the device ----------------------------------------------------
echo "Waiting for your phone (accept the 'Allow USB debugging' prompt if it appears)..."
"$ADB" wait-for-device
echo "Device(s) connected:"
"$ADB" devices

# Multiple devices are attached (e.g. phone + emulator) → pick the real phone.
# An emulator serial always starts with "emulator-", so anything else wins.
DEVICES=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')
PHONE=""
for d in $DEVICES; do
  case "$d" in emulator-*) ;; *) PHONE="$d"; break ;; esac
done
if [ -z "$PHONE" ]; then
  echo "Couldn't find a real phone (only emulators are attached). Plug your phone in."
  exit 1
fi
echo "Using device: $PHONE"

# --- capture ----------------------------------------------------------------
# Wipe both the main and the dedicated crash buffer so this file only
# contains what happens *this* run.
"$ADB" -s "$PHONE" logcat -b all -c 2>/dev/null || "$ADB" -s "$PHONE" logcat -c

echo
echo "======================================================================"
echo " STEP 1:  Open the Doondo app on your phone now."
echo " STEP 2:  Wait for it to crash / close."
echo " STEP 3:  Come back here and press ENTER."
echo "======================================================================"
read -r _

echo "Dumping crash log..."
{
  echo "==== Doondo crash capture $(date) — device $PHONE ===="
  echo
  echo "--- crash buffer (Android keeps the most recent fatal crash here) ---"
  "$ADB" -s "$PHONE" logcat -b crash -d 2>/dev/null
  echo
  echo "--- main buffer, errors + ReactNative + AndroidRuntime ---"
  "$ADB" -s "$PHONE" logcat -d \
      AndroidRuntime:V ReactNative:V ReactNativeJS:V \
      DEBUG:V libc:V "*:E" 2>/dev/null
  echo
  echo "--- last 200 lines of the main buffer (everything) ---"
  "$ADB" -s "$PHONE" logcat -d -t 200 2>/dev/null
} > "$OUT"

echo
echo "Saved log to: $OUT"
echo "Open that file and send it over — search it for 'FATAL EXCEPTION' for the crash."

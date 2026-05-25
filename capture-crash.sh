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
OUT="$HOME/Desktop/doondo-crash.txt"

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
echo "Device connected:"
"$ADB" devices

# --- capture ----------------------------------------------------------------
"$ADB" logcat -c    # clear old logs so the file only has this run
echo
echo ">>> NOW open the Doondo app on your phone and let it crash. <<<"
echo "    Capturing for 25 seconds..."
{
  echo "==== Doondo crash capture $(date) ===="
  "$ADB" logcat -d -t 1 >/dev/null 2>&1   # warm up
  timeout 25 "$ADB" logcat AndroidRuntime:E ReactNative:V ReactNativeJS:V "*:E" \
    2>/dev/null
} > "$OUT"

echo
echo "Saved log to: $OUT"
echo "Open that file and send it over — search it for 'FATAL EXCEPTION' for the crash."

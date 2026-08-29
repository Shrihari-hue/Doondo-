/**
 * withDoondoPulseWidget — Expo config plugin wiring the Doondo Pulse
 * home-screen widget (#30) into a prebuild.
 *
 * Plain CommonJS on purpose: Expo's TypeScript config-plugin loading goes
 * through Node's native ESM/CJS interop, which can't statically resolve
 * @expo/config-plugins's lazy-getter exports (withAndroidManifest etc.) in
 * this environment. Every plugin actually shipped in node_modules (e.g.
 * expo-notifications) ships plain .js with require()/module.exports for the
 * same reason — that's the well-supported path, so this file follows it.
 *
 * Android is fully automated here: App Widgets are just a manifest
 * receiver + resource files in the SAME app package, no separate build
 * target, so copying files + patching the manifest is safe to script.
 *
 * iOS is only partially automated. A Widget Extension is a genuinely
 * separate Xcode target, and safely adding one via raw .pbxproj text
 * surgery (rather than Xcode itself) is exactly the kind of change that
 * can silently corrupt a project in a way this sandbox has no way to
 * verify — so this plugin does the safe, well-supported part (the App
 * Group entitlement on the main app target) and copies the widget's
 * Swift source into the ios/ directory ready for the one-time manual
 * target-creation step documented at the top of
 * widget-src/ios/DoondoPulseWidget.swift.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withEntitlementsPlist } = require('@expo/config-plugins');

const APP_GROUP_ID = 'group.com.doondo.app.widget';
const ANDROID_WIDGET_PACKAGE_PATH = 'app/doondo/pulsewidget';
const WIDGET_SRC_DIR = path.join(__dirname, '..', 'widget-src');

function copyFileEnsuringDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else copyFileEnsuringDir(srcPath, destPath);
  }
}

// ─── Android ────────────────────────────────────────────────────────────────

const withPulseWidgetAndroidFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const androidRoot = cfg.modRequest.platformProjectRoot;
      const javaDir = path.join(
        androidRoot,
        'app/src/main/java',
        ANDROID_WIDGET_PACKAGE_PATH,
      );
      const resDir = path.join(androidRoot, 'app/src/main/res');

      copyFileEnsuringDir(
        path.join(WIDGET_SRC_DIR, 'android/PulseWidgetProvider.kt'),
        path.join(javaDir, 'PulseWidgetProvider.kt'),
      );
      copyDirRecursive(path.join(WIDGET_SRC_DIR, 'android/res'), resDir);

      return cfg;
    },
  ]);
};

const withPulseWidgetAndroidManifest = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.receiver = app.receiver ?? [];
    const already = app.receiver.some(
      (r) => r.$?.['android:name'] === '.PulseWidgetProvider' || r.$?.['android:name']?.endsWith('PulseWidgetProvider'),
    );
    if (already) return cfg;

    app.receiver.push({
      $: {
        'android:name': 'app.doondo.pulsewidget.PulseWidgetProvider',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/pulse_widget_info',
          },
        },
      ],
    });

    return cfg;
  });
};

// ─── iOS ────────────────────────────────────────────────────────────────────

/** Main app target gets the App Group entitlement — safe, well-supported mod. */
const withPulseWidgetIosEntitlements = (config) => {
  return withEntitlementsPlist(config, (cfg) => {
    const groups = new Set([
      ...(cfg.modResults['com.apple.security.application-groups'] ?? []),
      APP_GROUP_ID,
    ]);
    cfg.modResults['com.apple.security.application-groups'] = [...groups];
    return cfg;
  });
};

/**
 * Copies the widget's Swift source into ios/DoondoPulseWidget/ so it's
 * sitting right next to the Xcode project, ready for the one-time
 * manual "add a Widget Extension target, add this file to it" step —
 * NOT added to any target automatically (see file header for why).
 */
const withPulseWidgetIosSource = (config) => {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      copyFileEnsuringDir(
        path.join(WIDGET_SRC_DIR, 'ios/DoondoPulseWidget.swift'),
        path.join(iosRoot, 'DoondoPulseWidget/DoondoPulseWidget.swift'),
      );
      return cfg;
    },
  ]);
};

// ─── Entry point ────────────────────────────────────────────────────────────

const withDoondoPulseWidget = (config) => {
  config = withPulseWidgetAndroidFiles(config);
  config = withPulseWidgetAndroidManifest(config);
  config = withPulseWidgetIosEntitlements(config);
  config = withPulseWidgetIosSource(config);
  return config;
};

module.exports = withDoondoPulseWidget;

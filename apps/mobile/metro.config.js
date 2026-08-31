// Metro config for the Doondo mobile app.
//
// Two things this file does that the default Expo config doesn't:
//
//   1. Workspace awareness — Metro is told to watch the monorepo root
//      (../..) so it can see and resolve @doondo/tokens from packages/.
//      Without this, Metro can't resolve workspace packages.
//
//   2. NativeWind v4 setup — withNativeWind wraps the config so Tailwind
//      classes get compiled into RN styles via the global.css entry.

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders || []),
  workspaceRoot,
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = false;

// Local Expo modules (apps/mobile/modules/*) aren't inside node_modules,
// so they're invisible to the two hardcoded lookup paths above — Expo's
// own default config would normally add them automatically, but that
// default is overridden by disableHierarchicalLookup + the explicit
// nodeModulesPaths list. Map each local module's package name straight
// to its folder instead, same effect, scoped to just these packages.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'doondo-pulse-widget': path.resolve(projectRoot, 'modules/doondo-pulse-widget'),
};

module.exports = withNativeWind(config, { input: './global.css' });

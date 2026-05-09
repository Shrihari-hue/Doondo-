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

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = withNativeWind(config, { input: './global.css' });

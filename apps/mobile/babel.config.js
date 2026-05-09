// Babel config for the Doondo mobile app.
//
// Order matters here:
//   1. babel-preset-expo gets jsxImportSource set to "nativewind" so JSX uses
//      nativewind's runtime instead of plain react-native.
//   2. nativewind/babel runs after, hoisting className → style transforms.
//   3. react-native-reanimated/plugin MUST be the last plugin in the list.
//      Reanimated needs to see every other transform before it runs.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};

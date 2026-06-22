/**
 * Babel config.
 *
 * - `babel-preset-expo` automatically wires React Compiler, Reanimated 4
 *   (react-native-worklets) and Hermes transforms — do NOT add the
 *   reanimated/worklets plugins manually (see Expo SDK 56 docs).
 * - `jsxImportSource: 'nativewind'` + `nativewind/babel` enable className
 *   support on React Native components (NativeWind v4).
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};

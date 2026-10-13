/**
 * Le resolveur Jest de react-native-worklets, mais qui reconnait le paquet par
 * un SEGMENT de chemin, pas par une sous-chaine.
 *
 * L'original retire les extensions `.native` des que `basedir` CONTIENT
 * « react-native-worklets ». Sous pnpm, les pairs d'un paquet sont ecrits dans
 * le nom de son dossier :
 *
 *   node_modules/.pnpm/expo-modules-core@56.0.17_react-native-worklets@0.8.3_…/
 *
 * expo-modules-core y tombait donc aussi, et Jest chargeait sa version WEB :
 * plus aucun module natif simule, d'ou « Cannot find native module
 * 'ExpoSecureStore' » dans 13 suites. Sous npm, le chemin ne contient le nom
 * que pour le vrai paquet, et le probleme n'existait pas.
 */
const WORKLETS = /(^|[\\/])react-native-worklets([\\/]|$)/;

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) => {
  if (
    WORKLETS.test(options.basedir) ||
    request === 'react-native-worklets' ||
    request.startsWith('react-native-worklets/')
  ) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }

  return options.defaultResolver(request, options);
};

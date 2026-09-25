// Ecrit le fichier de jeton de la VALIDATION DES DEVELOPPEURS ANDROID dans les
// assets de l'APK.
//
// POURQUOI UN PLUGIN PLUTOT QU'UN FICHIER POSE A LA MAIN. Depose est en CNG :
// `android/` est regenere a chaque build et se trouve dans .gitignore. Un
// fichier depose a la main dans android/app/src/main/assets/ disparaitrait au
// prochain prebuild, c'est-a-dire avant meme d'arriver dans l'APK. Seul un
// plugin de config, qui s'execute PENDANT la generation, survit.
//
// CE QUE GOOGLE DEMANDE. Depuis l'annonce du 15 juillet 2026, tout paquet
// Android non enregistre au 30 septembre 2026 est retire de Google Play — et la
// regle couvre aussi les applications distribuees HORS Play, ce qui est le cas
// de l'APK Depose sur linkygroup.com. Pour prouver qu'on detient la cle privee
// d'un paquet, la Play Console demande un APK signe par cette cle et contenant
// un fichier `adi-registration.properties` dans `assets/`, ou l'on colle
// l'extrait fourni par la console.
//
// L'EXTRAIT EST LIE AU COMPTE DEVELOPPEUR, pas a ce paquet : le meme servira
// pour com.linky.driver et pour toute cle ajoutee a com.linkygroup.app. Il
// n'est pas secret au sens d'une cle : seul quelqu'un qui possede DEJA la cle
// privee peut s'en servir, puisqu'il faut signer l'APK avec. C'est d'ailleurs
// pour cela que Google le fait placer dans les sources de l'application.
//
// CE FICHIER PEUT ETRE RETIRE une fois les paquets valides — il ne sert qu'a la
// preuve de possession. On le garde tant que les trois enregistrements
// (com.linky.driver.preview, com.linky.driver, la cle hors Play de
// com.linkygroup.app) ne sont pas tous confirmes.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/** L'extrait fourni par la Play Console, compte « Abdoulaye BAH ». */
const TOKEN = 'D5R4LPK22CATKAAAAAAAAAAAAA';

const withAdiRegistration = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const assetsDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      );
      // Le dossier assets/ n'existe pas dans un projet Expo genere tant que rien
      // ne l'a cree : on le pose.
      fs.mkdirSync(assetsDir, { recursive: true });
      // L'extrait, colle tel quel — c'est ce que dit la console (« Copiez
      // l'extrait ci-dessous »). Le saut de ligne final evite qu'un lecteur
      // strict de .properties avale la derniere ligne.
      fs.writeFileSync(
        path.join(assetsDir, 'adi-registration.properties'),
        `${TOKEN}\n`,
        'utf8',
      );
      return cfg;
    },
  ]);

module.exports = withAdiRegistration;

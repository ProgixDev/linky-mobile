// Le pont vers le selecteur natif d'Android (modules/media-chooser).
//
// DEMANDE DU CLIENT, 2026-09-09, capture a l'appui : « Est-ce que c'est
// possible d'utiliser le modele integre des telephones » — l'ecran systeme
// « Selectionner une action » qui propose l'appareil photo ET la galerie d'un
// seul coup, au lieu de notre propre feuille de choix.
//
// LE REPLI EST LA RAISON D'ETRE DE CE FICHIER. requireOptionalNativeModule rend
// `null` quand le module natif n'est pas dans le binaire — c'est le cas de tout
// telephone qui tourne encore sur le build actuel, et de iOS, qui n'a pas
// d'equivalent a cet ecran. Les appelants testent `nativeChooserAvailable` et
// retombent sur la feuille. Ce fichier peut donc partir en mise a jour OTA sans
// attendre le build : il ne changera rien tant que le binaire ne suit pas.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Ce que le natif rend. Volontairement plus pauvre qu'un ImagePickerAsset :
 *  seuls ces champs sont lus par la chaine de televersement. */
export interface ChosenAsset {
  /** Toujours une URI file:// — jamais content://. Le natif recopie. */
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  /** Millisecondes, video seulement. Sert au plafond de 60 s. */
  duration: number | null;
}

interface NativeMediaChooser {
  chooseImages(limit: number, withCamera: boolean, title: string): Promise<ChosenAsset[]>;
  chooseVideo(withCamera: boolean, title: string, maxSeconds: number): Promise<ChosenAsset[]>;
}

// iOS n'a pas de selecteur d'intentions : la question ne se pose que sur
// Android, et la garde evite un appel inutile au registre des modules.
const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeMediaChooser>('LinkyMediaChooser')
    : null;

/** Vrai seulement si le binaire embarque le module. Faux sur iOS et sur tout
 *  build anterieur — les appelants doivent alors garder leur feuille. */
export const nativeChooserAvailable = nativeModule !== null;

export async function chooseImagesNative(
  limit: number,
  withCamera: boolean,
  title: string,
): Promise<ChosenAsset[]> {
  if (!nativeModule) return [];
  return nativeModule.chooseImages(limit, withCamera, title);
}

export async function chooseVideoNative(
  withCamera: boolean,
  title: string,
  maxSeconds: number,
): Promise<ChosenAsset[]> {
  if (!nativeModule) return [];
  return nativeModule.chooseVideo(withCamera, title, maxSeconds);
}

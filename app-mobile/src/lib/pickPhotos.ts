// Choix de la source des photos d'une annonce : APPAREIL PHOTO ou galerie.
// Client 2026-08-23 : « camera activer pour prendre de nouvelles photos quand le
// vendeur / agent veut ajouter une annonce ».
//
// POURQUOI CE FICHIER EXISTE : les ecrans produit et immobilier faisaient
// exactement le meme appel a la galerie, duplique. Les faire diverger sur un
// detail de permission serait passe inapercu jusqu'au premier telephone qui
// refuse la camera. Une seule porte, deux appelants.
//
// Sur le terrain guineen, le vendeur photographie sa marchandise sur place : la
// galerie seule l'obligeait a sortir de l'app, prendre la photo, puis revenir.
import * as ImagePicker from 'expo-image-picker';
import { chooseImagesNative, nativeChooserAvailable } from './nativeMediaChooser';

// Le type vit dans la feuille de choix : c'est elle qui produit la valeur,
// ce module ne fait que la consommer.
export type { MediaSource } from '../components/sheets/MediaSourceSheet';

/** Re-export pour que les ecrans n'aient qu'un import a faire. */
export { nativeChooserAvailable };

/** Ce que la chaine de televersement lit reellement d'un media choisi.
 *
 *  Volontairement plus etroit qu'un ImagePickerAsset : le selecteur natif ne
 *  fournit ni width ni height, et personne ne les lit. Un ImagePickerAsset
 *  satisfait cette forme, donc les deux chemins se rejoignent sans conversion. */
export interface PickedAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
}

/** 'system' = le selecteur d'intentions d'Android, qui propose l'appareil photo
 *  ET la galerie en un seul ecran (client 2026-09-09). Les deux autres restent
 *  le chemin de repli, pilote par notre feuille de choix. */
export type PickSource = 'camera' | 'gallery' | 'system';

export interface PickPhotosOptions {
  /** La source DEJA choisie par l'utilisateur.
   *
   *  Le choix se faisait ici, dans un Alert.alert natif. Il est remonte a
   *  l'ecran le 2026-09-08 (PhotoSourceSheet) : une alerte systeme ne
   *  ressemblait a rien du reste de l'app et ne pouvait rien dire d'utile.
   *  Ce module garde ce qu'il sait faire — permissions et selection — et ne
   *  s'occupe plus de demander. */
  source: PickSource;
  /** Nombre de photos encore acceptees. Borne la selection multiple. */
  remaining: number;
  /** Libelles traduits — l'appelant les resout, ce module ne connait pas i18n. */
  labels: {
    galleryDenied: string;
    cameraDenied: string;
    /** Titre du selecteur systeme. Android peut l'ignorer selon la version. */
    systemTitle: string;
  };
  /** Remonte un refus de permission a l'ecran appelant (toast). */
  onDenied: (message: string) => void;
}

/**
 * Renvoie les images choisies, ou un tableau vide si l'utilisateur annule ou
 * refuse la permission. Ne leve jamais pour une annulation : seul un vrai
 * echec technique remonte a l'appelant.
 */
export async function pickPhotos(opts: PickPhotosOptions): Promise<PickedAsset[]> {
  const { source, remaining, labels, onDenied } = opts;
  if (remaining <= 0) return [];

  if (source === 'system') {
    // La permission est demandee AVANT d'ouvrir le selecteur, et pas apres :
    // l'application declare android.permission.CAMERA, donc Android exige
    // qu'elle soit accordee pour qu'ACTION_IMAGE_CAPTURE aboutisse. On ne peut
    // pas savoir a l'avance ce que l'utilisateur va choisir.
    //
    // Un refus ne bloque PAS : le selecteur s'ouvre alors sans l'entree
    // appareil photo, et la galerie reste accessible. Refuser la camera ne doit
    // pas empecher de publier une annonce avec des photos deja prises.
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const picked = await chooseImagesNative(remaining, cam.granted, labels.systemTitle);
    return picked.slice(0, remaining);
  }

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      onDenied(labels.cameraDenied);
      return [];
    }
    // La camera ne rend qu'une image a la fois : c'est une contrainte du
    // systeme, pas un choix. L'utilisateur rappuie sur « Ajouter » pour la
    // suivante, et le plafond restant est recalcule a chaque passage.
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    if (shot.canceled || shot.assets.length === 0) return [];
    return shot.assets.slice(0, remaining);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    onDenied(labels.galleryDenied);
    return [];
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 0.8,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
  });
  if (picked.canceled || picked.assets.length === 0) return [];
  return picked.assets.slice(0, remaining);
}

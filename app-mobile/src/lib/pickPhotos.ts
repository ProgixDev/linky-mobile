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
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface PickPhotosOptions {
  /** Nombre de photos encore acceptees. Borne la selection multiple. */
  remaining: number;
  /** Libelles traduits — l'appelant les resout, ce module ne connait pas i18n. */
  labels: {
    title: string;
    body: string;
    camera: string;
    gallery: string;
    cancel: string;
    galleryDenied: string;
    cameraDenied: string;
  };
  /** Remonte un refus de permission a l'ecran appelant (toast). */
  onDenied: (message: string) => void;
}

/**
 * Renvoie les images choisies, ou un tableau vide si l'utilisateur annule ou
 * refuse la permission. Ne leve jamais pour une annulation : seul un vrai
 * echec technique remonte a l'appelant.
 */
export async function pickPhotos(opts: PickPhotosOptions): Promise<ImagePicker.ImagePickerAsset[]> {
  const { remaining, labels, onDenied } = opts;
  if (remaining <= 0) return [];

  const choice = await askSource(labels);
  if (choice === 'cancel') return [];

  if (choice === 'camera') {
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

/** Alert natif plutot qu'une feuille maison : deux options, aucun etat a gerer. */
function askSource(labels: PickPhotosOptions['labels']): Promise<'camera' | 'gallery' | 'cancel'> {
  return new Promise((resolve) => {
    Alert.alert(
      labels.title,
      labels.body,
      [
        { text: labels.camera, onPress: () => resolve('camera') },
        { text: labels.gallery, onPress: () => resolve('gallery') },
        // onDismiss ne se declenche pas partout (retour arriere Android) ; le
        // bouton d'annulation garantit qu'on resout toujours la promesse.
        { text: labels.cancel, style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}

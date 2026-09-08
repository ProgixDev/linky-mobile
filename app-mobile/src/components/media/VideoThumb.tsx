import { useEffect } from 'react';
import { View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

/**
 * La PREMIERE IMAGE d'une video, figee — une vignette.
 *
 * DEMANDE DU CLIENT, 2026-09-08 : « il faut voir le premier frame of the video
 * ici in the card video and when i added video ». Apres avoir ajoute une video,
 * l'ecran n'affichait qu'une icone de pellicule et le texte « Vidéo ajoutée » :
 * rien ne disait QUELLE video, ni meme si le televersement avait pris la bonne.
 * Sur l'apercu, une annonce sans photo mais avec video montrait un rectangle
 * gris « aucune photo » — alors qu'on avait de quoi montrer quelque chose.
 *
 * POURQUOI expo-video ET PAS expo-video-thumbnails. Le second extrait une vraie
 * image et serait plus econome, mais c'est une dependance NATIVE : l'ajouter
 * imposerait un nouveau build, donc un passage par le store, pour un detail
 * d'affichage. expo-video est deja embarque (fil Decouvrir, ecran d'accueil,
 * fiche immobiliere) : un lecteur en pause sur la premiere image donne le meme
 * resultat a l'ecran et part en mise a jour OTA le jour meme.
 *
 * Le lecteur ne joue JAMAIS : ni son, ni boucle, ni controles. C'est une image,
 * pas une lecture — sur un forfait guineen, une vignette qui se met a lire
 * toute seule consomme des donnees que personne n'a demandees.
 */
export function VideoThumb({
  uri,
  style,
  contentFit = 'cover',
}: {
  uri: string;
  style?: React.ComponentProps<typeof View>['style'];
  contentFit?: 'cover' | 'contain';
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });

  // pause() explicite : selon la plateforme et la version, un lecteur fraichement
  // cree peut demarrer seul. On ne veut qu'une image fixe.
  useEffect(() => {
    player.pause();
  }, [player]);

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit={contentFit}
        nativeControls={false}
      />
    </View>
  );
}

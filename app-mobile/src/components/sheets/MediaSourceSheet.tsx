import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Sheet } from './Sheet';
import { I } from '../../icons/Icon';
import { haptic } from '../../lib/haptics';

export type MediaSource = 'camera' | 'gallery';

/** Photos d'annonce, ou video de presentation. */
export type MediaKind = 'photo' | 'video';

/**
 * Choix de la source d'un media d'annonce : appareil photo / camera, ou galerie.
 * Sert aux PHOTOS et a la VIDEO — c'est le meme geste, avec d'autres mots.
 *
 * REMPLACE UN Alert.alert NATIF (2026-09-08). L'alerte systeme posait trois
 * problemes que sa simplicite d'ecriture cachait :
 *
 *   1. Elle ne ressemblait a rien du reste de l'app — police, coins, couleurs
 *      et ordre des boutons sont ceux d'Android, pas les notres. C'est le seul
 *      endroit du tunnel de creation ou le vendeur sortait visuellement de
 *      Linky, au moment precis ou on lui demande un effort.
 *   2. Trois libelles empiles, sans hierarchie : « Annuler » avait exactement
 *      le meme poids visuel que l'action principale, et Android le placait en
 *      PREMIER. La sortie etait plus visible que l'entree.
 *   3. Elle ne pouvait rien dire d'utile. Ici, la ligne galerie annonce
 *      combien de photos il reste — une information qu'on possede et qui evite
 *      une selection tronquee sans explication.
 *
 * ELLE REPOSE SUR `Sheet`, la feuille de l'app. Une premiere version utilisait
 * une Modal maison, parce que `Sheet` reservait 70 px pour la barre d'onglets
 * et n'acceptait que des hauteurs en pourcentage — deux hypotheses fausses ici
 * (ecran de pile, deux options). Plutot que de laisser l'app avec DEUX systemes
 * de feuilles, ces deux hypotheses sont devenues des options : `reserveTabBar`
 * et `fitContent`, toutes deux par defaut sur l'ancien comportement, donc les
 * cinq feuilles existantes empruntent exactement le meme chemin qu'avant.
 *
 * Ce qu'on y gagne : le glisser-pour-fermer, le meme voile et la meme physique
 * que partout ailleurs. Une feuille qui se ferme autrement que les autres se
 * remarque, meme sans qu'on sache dire pourquoi.
 */
export function MediaSourceSheet({
  open,
  kind,
  remaining = 0,
  onPick,
  onClose,
}: {
  open: boolean;
  kind: MediaKind;
  /** Photos encore acceptees — affiche sur la ligne galerie. Ignore en video. */
  remaining?: number;
  onPick: (source: MediaSource) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const photo = kind === 'photo';

  const choose = (source: MediaSource) => {
    haptic.light();
    // On ferme AVANT de declencher : la camera et la galerie sont des vues
    // systeme, et les ouvrir par-dessus une feuille encore montee la laisse
    // visible derriere au retour, sur certains Android.
    onClose();
    onPick(source);
  };

  return (
    <Sheet open={open} onClose={onClose} reserveTabBar={false} fitContent>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text variant="titleM" style={{ marginBottom: 4 }}>
          {t(photo ? 'create.photoSourceTitle' : 'create.videoSourceTitle')}
        </Text>
        <Text variant="caption" tone="muted" style={{ letterSpacing: 0, marginBottom: 18 }}>
          {t(photo ? 'create.photoSourceBody' : 'create.videoSourceBody')}
        </Text>

        <SourceRow
          Icon={photo ? I.camera : I.video}
          title={t(photo ? 'create.photoSourceCamera' : 'create.videoSourceCamera')}
          hint={t(photo ? 'create.photoSourceCameraHint' : 'create.videoSourceCameraHint')}
          onPress={() => choose('camera')}
        />
        <View style={{ height: 10 }} />
        <SourceRow
          Icon={I.image}
          title={t(photo ? 'create.photoSourceGallery' : 'create.videoSourceGallery')}
          hint={photo
            ? t('create.photoSourceGalleryHint', { count: remaining })
            : t('create.videoSourceGalleryHint')}
          onPress={() => choose('gallery')}
        />

        {/* « Annuler » reste discret : la feuille se ferme aussi en tirant vers
            le bas ou en touchant le voile. C'est un dernier recours, pas une
            option — l'alerte systeme d'avant lui donnait le meme poids qu'aux
            deux vraies actions, et Android le placait meme en premier. */}
        <Pressable
          onPress={() => {
            haptic.light();
            onClose();
          }}
          style={{ marginTop: 16, paddingVertical: 12, alignItems: 'center' }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textMuted }}>
            {t('common.cancel')}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/** Une option : pastille d'icone, titre, sous-titre, chevron. */
function SourceRow({
  Icon,
  title,
  hint,
  onPress,
}: {
  Icon: (p: { size?: number; color?: string; strokeWidth?: number }) => React.ReactElement | null;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const { colors, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: pressed ? colors.primary : colors.border,
        backgroundColor: pressed ? colors.primarySoft : colors.bg,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.md,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} color={colors.primaryDeep} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none', marginTop: 1 }}>
          {hint}
        </Text>
      </View>
      <I.chevronR size={18} color={colors.textFaint} />
    </Pressable>
  );
}


import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
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
 * POURQUOI PAS `Sheet` (src/components/sheets/Sheet.tsx) : elle reserve 70 px
 * pour la barre d'onglets, parce que toutes les feuilles de l'app s'ouvrent
 * depuis un ecran d'onglet. Le tunnel de creation est un ecran de pile, sans
 * barre : la marge serait un trou. Et ses hauteurs ('60%', '90%') sont faites
 * pour des listes, pas pour deux options.
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
  const { colors, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const photo = kind === 'photo';

  const choose = (source: MediaSource) => {
    haptic.light();
    // On ferme AVANT de declencher : la camera et la galerie sont des vues
    // systeme, et les ouvrir par-dessus une modale encore montee laisse la
    // feuille visible derriere au retour sur certains Android.
    onClose();
    onPick(source);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      // Le retour arriere Android doit fermer la feuille, pas l'ecran.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Fond tapable. Une feuille qu'on ne peut fermer qu'avec un bouton
            precis se lit comme un piege ; l'app ferme partout ailleurs au
            toucher exterieur. */}
        <Pressable
          onPress={onClose}
          style={{ ...StyleSheetAbsoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' }}
          accessibilityLabel={t('common.cancel')}
        />

        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          {/* Poignee : dit sans mot que ca se tire vers le bas. */}
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 4,
              borderRadius: 999,
              backgroundColor: colors.borderStrong,
              marginBottom: 16,
            }}
          />

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
      </View>
    </Modal>
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

/** Evite d'importer StyleSheet pour une seule constante. */
const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

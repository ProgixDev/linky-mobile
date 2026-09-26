import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { Sheet } from './Sheet';
import { I } from '../../icons/Icon';
import { haptic } from '../../lib/haptics';
import { useToast } from '../feedback/Toast';
import { toToastMessage } from '../../lib/api';
import {
  REPORT_REASON_ORDER,
  useReportContent,
  type ReportReason,
  type ReportTargetKind,
} from '../../data/queries/moderation';

/**
 * Signaler une annonce, un avis, un commentaire ou une personne.
 *
 * POURQUOI CE GESTE EXISTE. La politique Google Play sur le contenu genere par
 * les utilisateurs exige trois choses d'une application qui en publie : pouvoir
 * signaler, moderer, et bloquer. Linky publiait des annonces, des avis et des
 * commentaires depuis des mois sans aucun des deux premiers cotes utilisateur —
 * la moderation existait, mais seulement dans la console admin, sans rien pour
 * l'alimenter.
 *
 * DEUX TEMPS, PAS UN. Un premier jet envoyait le signalement au toucher du
 * motif, en un seul geste. C'est tentant sur une connexion lente, mais un
 * signalement est une accusation : le toucher accidentel n'y a pas sa place, et
 * il n'existe aucun geste d'annulation apres coup. Le motif se choisit donc, se
 * voit choisi, et un bouton confirme.
 *
 * LE CHAMP LIBRE EST FACULTATIF ET LE RESTE. Il donne au moderateur le contexte
 * que six motifs ne portent pas — « le vendeur demande un virement en dehors de
 * l'application » n'est pas la meme chose que « Arnaque » tout court. L'exiger
 * couterait bien plus de signalements qu'il n'en ameliorerait.
 */
export function ReportSheet({
  open,
  onClose,
  targetKind,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetKind: ReportTargetKind;
  targetId: string;
}) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const report = useReportContent();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');

  // La feuille est montee en permanence par son ecran parent : sans cette
  // remise a zero, le motif choisi la fois precedente serait deja selectionne a
  // la reouverture — sur une AUTRE cible, ce qui est le pire des cas.
  useEffect(() => {
    if (!open) {
      setReason(null);
      setDetails('');
    }
  }, [open]);

  const submit = async () => {
    if (!reason || report.isPending) return;
    haptic.light();
    try {
      await report.mutateAsync({
        targetKind,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      // `already: true` (deja signale) passe aussi par ici, et c'est voulu :
      // pour la personne, son signalement est bien enregistre. Lui repondre
      // « vous avez deja signale » laisserait croire a un echec.
      onClose();
      toast.show(t('moderation.reportThanks'), 'success');
    } catch (e) {
      toast.show(toToastMessage(e, t('moderation.reportError')), 'danger');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} reserveTabBar={false} snapPoints={['70%', '92%']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Text variant="titleM" style={{ marginBottom: 4 }}>
          {t('moderation.reportTitle')}
        </Text>
        <Text variant="caption" tone="muted" style={{ letterSpacing: 0, marginBottom: 16 }}>
          {t('moderation.reportSubtitle')}
        </Text>

        {REPORT_REASON_ORDER.map((r) => {
          const selected = reason === r;
          return (
            <Pressable
              key={r}
              onPress={() => {
                haptic.light();
                setReason(r);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t('moderation.reasons.' + r)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 13,
                paddingHorizontal: 14,
                marginBottom: 8,
                borderRadius: radii.md,
                borderWidth: 1,
                // La selection se lit a la BORDURE et a la pastille, pas a une
                // teinte de fond : sur les ecrans que vise Linky, un fond
                // legerement colore en plein soleil ne se distingue pas.
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: pressed ? colors.bgElev : colors.bg,
              })}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: selected ? 0 : 1.5,
                  borderColor: colors.border,
                  backgroundColor: selected ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? <I.check size={13} color="#FFFFFF" stroke={2.5} /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: 14.5, fontWeight: selected ? '600' : '500' }}>
                {t('moderation.reasons.' + r)}
              </Text>
            </Pressable>
          );
        })}

        <Text
          variant="caption"
          tone="muted"
          style={{ letterSpacing: 0, marginTop: 8, marginBottom: 6 }}
        >
          {t('moderation.reportDetailsLabel')}
        </Text>
        {/* BottomSheetTextInput et non TextInput : c'est lui qui fait remonter la
            feuille au-dessus du clavier (meme raison que dans CityFilterChips). */}
        <BottomSheetTextInput
          value={details}
          onChangeText={setDetails}
          placeholder={t('moderation.reportDetailsPlaceholder')}
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={1000}
          style={{
            minHeight: 76,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgElev,
            padding: 12,
            color: colors.text,
            fontSize: 14,
            textAlignVertical: 'top',
          }}
        />

        <View style={{ height: 16 }} />
        <Button
          label={t('moderation.reportSubmit')}
          variant="primary"
          // Desactive tant qu'aucun motif n'est choisi : c'est la seule donnee
          // que le serveur exige, et un envoi refuse en 400 serait incomprehensible.
          disabled={!reason}
          loading={report.isPending}
          onPress={() => void submit()}
        />
        <Pressable
          onPress={() => {
            haptic.light();
            onClose();
          }}
          style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center' }}
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

/** L'icone du geste, pour les ecrans qui ouvrent cette feuille. */
export const ReportIcon = I.warn;

import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ReportSheet } from './ReportSheet';
import { useToast } from '../feedback/Toast';
import { toToastMessage } from '../../lib/api';
import { useBlockUser, type ReportTargetKind } from '../../data/queries/moderation';

/**
 * Le menu « Signaler / Bloquer », partagé par toutes les surfaces qui portent du
 * contenu écrit par quelqu'un d'autre : fiche article, fiche bien, fil de
 * commentaires, avis.
 *
 * POURQUOI UN HOOK ET PAS UN COMPOSANT. Le geste a deux moitiés qui ne vivent
 * pas au même endroit de l'arbre : un menu natif déclenché depuis un bouton
 * quelconque de l'écran, et une feuille qui doit être montée une seule fois près
 * de la racine de cet écran. Un composant unique obligerait chaque appelant à
 * envelopper son bouton ; le hook rend les deux moitiés séparément.
 *
 * DEUX CONFIRMATIONS POUR BLOQUER, une seule pour signaler. Le signalement a sa
 * propre feuille, qui est déjà une étape de réflexion. Le blocage, lui, part
 * directement d'un menu : sans second écran il suffirait d'un doigt mal placé
 * pour faire disparaître un vendeur de tout le catalogue, sans comprendre
 * pourquoi ni savoir que ça se défait dans les réglages.
 */
export function useModerationMenu() {
  const { t } = useTranslation();
  const toast = useToast();
  const blockUser = useBlockUser();
  const [reporting, setReporting] = useState<{ kind: ReportTargetKind; id: string } | null>(null);

  const confirmBlock = (userId: string) => {
    Alert.alert(t('moderation.blockTitle'), t('moderation.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await blockUser.mutateAsync(userId);
              toast.show(t('moderation.blockDone'), 'success');
            } catch (e) {
              toast.show(toToastMessage(e, t('moderation.blockError')), 'danger');
            }
          })();
        },
      },
    ]);
  };

  /**
   * @param title      Ce qui est mis en cause — le nom de la personne, ou le
   *                   titre de l'annonce. Sert d'en-tête au menu natif, pour
   *                   qu'on sache sur quoi on agit.
   * @param blockeeId  L'auteur. Omis quand on ne le connaît pas : le menu
   *                   n'affiche alors que « Signaler ».
   */
  const openMenu = (opts: {
    title: string;
    targetKind: ReportTargetKind;
    targetId: string;
    blockeeId?: string | null;
  }) => {
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.report'),
        onPress: () => setReporting({ kind: opts.targetKind, id: opts.targetId }),
      },
    ];
    if (opts.blockeeId) {
      buttons.push({
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () => confirmBlock(opts.blockeeId!),
      });
    }
    Alert.alert(opts.title, undefined, buttons);
  };

  /**
   * À rendre UNE fois par écran, au même niveau que les autres feuilles. Montée
   * en permanence et pilotée par l'état : la monter conditionnellement priverait
   * la feuille de son animation d'ouverture.
   */
  const moderationSheet = (
    <ReportSheet
      open={!!reporting}
      onClose={() => setReporting(null)}
      targetKind={reporting?.kind ?? 'product'}
      targetId={reporting?.id ?? ''}
    />
  );

  return { openMenu, moderationSheet };
}

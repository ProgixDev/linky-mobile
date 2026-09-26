// Signalement et blocage — les deux gestes que la politique Google Play sur le
// contenu généré par les utilisateurs exige à côté de la modération, qui existait
// déjà côté console admin.
//
// UN BLOCAGE CHANGE CE QUE RENVOIE LE SERVEUR sur presque tous les écrans de
// découverte : le feed, les listes d'articles et de biens, les fils de
// commentaires, les avis d'une boutique. On invalide donc large après un
// blocage ou un déblocage — c'est le seul moment où l'utilisateur s'attend
// précisément à ce que ce qu'il voit change, et il vaut mieux un rechargement de
// trop qu'une annonce fantôme qui reste à l'écran après qu'on a bloqué son
// vendeur.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export type ReportTargetKind = 'product' | 'property' | 'comment' | 'review' | 'user';

export type ReportReason = 'spam' | 'illegal' | 'offensive' | 'scam' | 'wrong_info' | 'other';

export interface BlockedUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

/**
 * Les motifs proposés, dans l'ordre d'affichage. Le libellé n'est PAS ici : il
 * se lit avec `t('moderation.reasons.' + motif)`, comme tout le reste de
 * l'interface. Un tableau de chaînes françaises dans la couche de données
 * serait invisible au traducteur et illisible en anglais et en espagnol.
 */
export const REPORT_REASON_ORDER: ReportReason[] = [
  'scam',
  'illegal',
  'offensive',
  'spam',
  'wrong_info',
  'other',
];

export function useReportContent() {
  return useMutation({
    mutationFn: async (input: {
      targetKind: ReportTargetKind;
      targetId: string;
      reason: ReportReason;
      details?: string;
    }) => {
      // `already: true` quand la personne avait déjà signalé cette cible — le
      // serveur ne traite pas le doublon comme une erreur, et l'écran non plus :
      // on remercie dans les deux cas. Dire « vous avez déjà signalé » n'apporte
      // rien et laisse croire que quelque chose a échoué.
      return await apiPost<{ report_id: string | null; already: boolean }>({
        path: '/report-content',
        body: {
          target_kind: input.targetKind,
          target_id: input.targetId,
          reason: input.reason,
          ...(input.details ? { details: input.details } : {}),
        },
      });
    },
  });
}

/** Les clés de cache qu'un blocage rend périmées. */
const AFFECTED_KEYS = [
  ['discover-feed'],
  ['discover-infinite'],
  ['products'],
  ['products-infinite'],
  ['properties'],
  ['properties-infinite'],
  ['listing-comments'],
];

function invalidateAffected(qc: ReturnType<typeof useQueryClient>) {
  for (const key of AFFECTED_KEYS) qc.invalidateQueries({ queryKey: key });
  // Les avis sont indexés par boutique : on ne sait pas laquelle est concernée,
  // donc on invalide la famille entière par son préfixe.
  qc.invalidateQueries({ queryKey: ['shop-reviews'] });
  qc.invalidateQueries({ queryKey: ['blocked-users'] });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      await apiPost<{ blocked: boolean }>({ path: '/block-user', body: { user_id: userId } }),
    onSuccess: () => invalidateAffected(qc),
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      await apiPost<{ blocked: boolean }>({ path: '/unblock-user', body: { user_id: userId } }),
    onSuccess: () => invalidateAffected(qc),
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: ['blocked-users'],
    queryFn: async (): Promise<BlockedUser[]> => {
      const { blocked } = await apiPost<{ blocked: BlockedUser[] }>({
        path: '/list-blocked-users',
        body: {},
      });
      return blocked;
    },
  });
}

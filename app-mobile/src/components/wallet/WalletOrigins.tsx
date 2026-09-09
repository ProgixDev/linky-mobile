import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { formatGNF } from '../../lib/format';
import type { Wallet, WalletOrigin } from '../../data/types';

/**
 * « D'ou vient cet argent » — la ventilation du solde par origine.
 *
 * DEMANDE DU CLIENT, 2026-09-09 : « j'ai pas eu de reservation de logement mais
 * mon Wallet Immo est credite ». Son diagnostic etait exact — il n'y a qu'UN
 * portefeuille par personne, affiche sur trois tableaux de bord. Ses 10 000 GNF
 * venaient d'une vraie vente d'article sur sa boutique.
 *
 * Il veut a terme des caisses separees ; il a valide cette etape en attendant :
 * un seul solde, mais chaque ecran dit d'ou vient l'argent.
 *
 * TOUTES LES ORIGINES SONT AFFICHEES, y compris celles qui RETIRENT de l'argent
 * (achats, retraits, mises en avant), avec leur signe. La somme des lignes
 * tombe donc toujours exactement sur le solde affiche au-dessus. Ne montrer que
 * les entrees serait plus joli et faux : quelqu'un qui additionne trouverait
 * plus que son solde, et c'est precisement le genre d'ecart qui fait douter
 * d'un ecran d'argent.
 *
 * L'ORDRE EST FIXE, pas celui du serveur : les deux origines qui interessent un
 * professionnel — ce qu'il a vendu, ce qu'il a loue — viennent en premier.
 */
const ORDER: WalletOrigin[] = [
  'products',
  'properties',
  'topup',
  'refund',
  'purchase',
  'boost',
  'withdrawal',
  'other',
];

const LABEL: Record<WalletOrigin, string> = {
  products: "Ventes d'articles",
  properties: 'Locations',
  topup: 'Recharges',
  refund: 'Remboursements',
  purchase: 'Achats',
  boost: 'Mises en avant',
  withdrawal: 'Retraits',
  other: 'Autres',
};

export function WalletOrigins({
  origins,
  tone = 'onDark',
}: {
  origins: Wallet['originsGnf'] | undefined;
  /** 'onDark' : sur la carte de solde. 'onLight' : sur un fond clair. */
  tone?: 'onDark' | 'onLight';
}) {
  if (!origins) return null;
  const rows = ORDER.filter((k) => typeof origins[k] === 'number' && origins[k] !== 0);
  if (rows.length === 0) return null;

  const color = tone === 'onDark' ? 'rgba(255,255,255,0.62)' : undefined;
  const strong = tone === 'onDark' ? 'rgba(255,255,255,0.9)' : undefined;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
      {rows.map((k, i) => {
        const v = origins[k] as number;
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            {i > 0 && (
              <Text style={{ fontSize: 11.5, color, marginRight: 4 }} tone={tone === 'onLight' ? 'muted' : undefined}>
                ·
              </Text>
            )}
            <Text
              style={{ fontSize: 11.5, color, letterSpacing: 0 }}
              tone={tone === 'onLight' ? 'muted' : undefined}
            >
              {LABEL[k]}{' '}
            </Text>
            <Text
              style={{ fontSize: 11.5, fontWeight: '700', color: strong, fontVariant: ['tabular-nums'] }}
            >
              {/* Le signe n'est mis que sur les sorties : un « + » devant chaque
                  vente alourdirait la ligne sans rien apprendre. */}
              {v < 0 ? `− ${formatGNF(-v)}` : formatGNF(v)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

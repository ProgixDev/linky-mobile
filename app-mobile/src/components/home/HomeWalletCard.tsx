import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Plus, Wallet } from 'lucide-react-native';
import { NoiseOverlay } from '../visuals/NoiseOverlay';
import { Text } from '../primitives/Text';
import { formatGNF, formatEUR } from '../../lib/format';
import { gnfToEur } from '../../lib/currency';
import { haptic } from '../../lib/haptics';
import { relativeLabel } from '../notifications/NotificationRow';
import type { WalletMovement } from '../../data/types';

// LA CARTE DU SOLDE, DEVENUE UN TABLEAU DE BORD (client, 2026-09-28 :
// « l'Accueil, transformer le Wallet en tableau de bord dynamique »).
//
// ┌─ CE QU'ELLE MONTRE, ET CE QU'ELLE REFUSE DE MONTRER ────────────────────┐
// Elle ne coûte AUCUN appel réseau de plus : `useWallet()` charge déjà le
// solde ET l'historique pour cette page, et l'Accueil s'en servait pour un seul
// chiffre. Sur les réseaux que vise Linky, c'est la contrainte qui décide.
//
// Ce qu'elle ajoute est donc de l'information déjà payée :
//   — les DEUX caisses, quand la caisse Immo n'est pas vide. Le client les a
//     demandées séparées le 2026-09-24 ; la carte n'affichait que leur somme,
//     ce qui effaçait sur la première page la distinction qu'il voulait.
//   — le mois en cours, entrées et sorties.
//   — le dernier mouvement, en clair.
//
// ⚠️ Ce qu'elle NE montre PAS : la ventilation par origine (« Ventes
// d'articles », « Locations »…). Le composant existe et fonctionne, mais le
// client a demandé de la MASQUER le 2026-09-25, sur les deux caisses, après
// avoir changé d'avis deux fois. La remettre ici au nom d'un « tableau de
// bord » serait revenir sur sa décision sans la lui reposer.
// └─────────────────────────────────────────────────────────────────────────┘

/**
 * Le mois en cours, calculé sur les mouvements DÉJÀ chargés.
 *
 * ⚠️ `useWallet()` n'en charge que les CINQUANTE derniers. Au-delà, un total
 * mensuel calculé dessus serait SOUS-ÉVALUÉ — et un chiffre d'argent faux est
 * pire que pas de chiffre du tout : personne ne peut deviner qu'il est tronqué.
 *
 * D'où `complete` : le mois n'est sûr que si la page chargée REMONTE plus loin
 * que son premier jour (ou si elle n'est pas pleine, donc qu'il n'y a rien
 * derrière). Sinon l'appelant n'affiche rien et la carte reste honnête.
 */
export function monthSummary(
  movements: WalletMovement[] | undefined,
  now: Date,
): { inGnf: number; outGnf: number; complete: boolean } {
  const list = movements ?? [];
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let inGnf = 0;
  let outGnf = 0;
  let oldest = Number.POSITIVE_INFINITY;
  for (const m of list) {
    const at = new Date(m.date).getTime();
    if (Number.isFinite(at)) oldest = Math.min(oldest, at);
    if (!Number.isFinite(at) || at < startOfMonth) continue;
    // `amountGnf` est SIGNÉ (+ entrée / − sortie) : on prend sa valeur absolue
    // et c'est `direction` qui décide du côté. Additionner le signé donnerait
    // un net, pas deux colonnes.
    if (m.direction === 'in') inGnf += Math.abs(m.amountGnf);
    else outGnf += Math.abs(m.amountGnf);
  }

  // La page pleine est le signal de troncature : 50 est la limite demandée par
  // useWallet(). Moins de 50 = tout l'historique tient dedans.
  const PAGE = 50;
  const complete = list.length < PAGE || oldest < startOfMonth;
  return { inGnf, outGnf, complete };
}

export function HomeWalletCard({
  balanceGnf,
  sellerGnf,
  immoGnf,
  movements,
  ready,
  onRecharger,
  onTap,
}: {
  /** Le TOTAL des deux caisses — la carte répond à « combien ai-je ? ». */
  balanceGnf: number;
  sellerGnf: number;
  immoGnf: number;
  movements: WalletMovement[] | undefined;
  ready: boolean;
  onRecharger?: () => void;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  const month = monthSummary(movements, new Date());
  const last = (movements ?? [])[0];
  const showKinds = ready && immoGnf > 0;
  const showMonth = ready && month.complete && (month.inGnf > 0 || month.outGnf > 0);

  return (
    <Pressable onPress={onTap}>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: '#0A5240' }}>
        {/* Base emerald gradient */}
        <LinearGradient
          colors={['#118866', '#0A5240', '#063929']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Soft saffron blob bleed (top-right) for mesh feel */}
        <LinearGradient
          colors={['rgba(232,165,61,0.35)', 'rgba(232,165,61,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.6 }}
          style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: 999 }}
        />
        {/* Cool mint blob (bottom-left) */}
        <LinearGradient
          colors={['rgba(120,220,180,0.18)', 'rgba(120,220,180,0)']}
          start={{ x: 0, y: 1 }}
          end={{ x: 0.6, y: 0.4 }}
          style={{ position: 'absolute', bottom: -50, left: -30, width: 220, height: 220, borderRadius: 999 }}
        />
        <NoiseOverlay />

        <View style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.6 }}>
              {t('home.walletBalance')}
            </Text>
            <Image
              source={require('../../../assets/images/adaptive-icon-dark.png')}
              style={{ width: 64, height: 64 }}
              contentFit="contain"
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: '#FFFFFF',
                lineHeight: 38,
                includeFontPadding: false,
              }}
            >
              {ready ? formatGNF(balanceGnf).replace(' GNF', '') : '—'}
            </Text>
            <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', fontWeight: '600' }}>GNF</Text>
          </View>
          {/* formatEUR préfixe déjà « ≈ ». « — » tant que la requête n'a pas
              répondu, pour ne pas afficher un « ≈ 0 € » confiant sur un
              démarrage 3G à froid. */}
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {ready ? formatEUR(gnfToEur(balanceGnf)) : '—'}
          </Text>

          {/* LES DEUX CAISSES. Seulement quand l'Immo n'est pas vide : pour
              l'immense majorité des comptes elle vaut zéro, et une ligne
              « Immo 0 GNF » poserait une question au lieu d'en répondre une. */}
          {showKinds && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
              <KindChip label={t('home.walletSeller')} amount={sellerGnf} />
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>·</Text>
              <KindChip label={t('home.walletImmo')} amount={immoGnf} />
            </View>
          )}

          {/* LE MOIS EN COURS. Absent quand il ne peut pas être garanti complet
              (voir monthSummary) : mieux vaut rien qu'un montant sous-évalué. */}
          {showMonth && (
            <View
              style={{
                flexDirection: 'row',
                gap: 18,
                marginTop: 14,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.14)',
              }}
            >
              <MonthStat label={t('home.walletMonthIn')} amount={month.inGnf} sign="+" />
              <MonthStat label={t('home.walletMonthOut')} amount={month.outGnf} sign="−" />
            </View>
          )}

          {/* LE DERNIER MOUVEMENT, en clair. C'est lui qui fait qu'un solde
              inchangé ne ressemble pas à un écran figé. */}
          {ready && last && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: showMonth ? 10 : 14 }}>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.62)', letterSpacing: 0 }} numberOfLines={1}>
                {last.label}
              </Text>
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '700',
                  color: last.direction === 'in' ? '#8FE3C0' : 'rgba(255,255,255,0.9)',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {last.direction === 'in' ? '+ ' : '− '}
                {formatGNF(Math.abs(last.amountGnf))}
              </Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>·</Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>
                {relativeLabel(last.date, t)}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {/* La pastille de recharge n'existe que si le parent passe
                onRecharger (conditionné par WALLET_TOPUP_ENABLED). */}
            {onRecharger && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  haptic.light();
                  onRecharger();
                }}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Plus size={14} color="#0A5240" strokeWidth={2.5} />
                <Text style={{ color: '#0A5240', fontWeight: '700', fontSize: 13.5 }}>
                  {t('home.walletRecharge')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                haptic.light();
                onTap();
              }}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.16)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.22)',
              }}
            >
              <Wallet size={14} color="#FFFFFF" strokeWidth={2.25} />
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13.5 }}>
                {t('home.walletOpen')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function KindChip({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.62)', letterSpacing: 0 }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.9)', fontVariant: ['tabular-nums'] }}>
        {formatGNF(amount)}
      </Text>
    </View>
  );
}

function MonthStat({ label, amount, sign }: { label: string; amount: number; sign: '+' | '−' }) {
  return (
    <View>
      <Text style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.4, fontWeight: '700' }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 14.5,
          fontWeight: '700',
          color: sign === '+' ? '#8FE3C0' : '#FFFFFF',
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {sign} {formatGNF(amount)}
      </Text>
    </View>
  );
}

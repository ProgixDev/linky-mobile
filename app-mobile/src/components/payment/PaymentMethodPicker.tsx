// Le choix du moyen de paiement, UNE seule fois pour toute l'application.
//
// Client 2026-09-04 : « Unifier les methodes de paiement dans l'appli », apres
// avoir constate que la reservation d'un logement ne proposait AUCUN choix (elle
// sautait directement a un champ telephone) et que le boost en proposait trois
// autres, differents de ceux du panier. Les trois ecrans avaient chacun leur
// propre liste ecrite a la main ; c'est desormais ce composant, et lui seul.
//
// CE QUE CHAQUE PROFIL VOIT — la regle vient du client :
//   etranger : Carte bancaire (Stripe) + Mobile money (Lengopay)
//   Guinee   : page Lengopay (Carte bancaire + Wallet Paycard/Kulu/Soutra +
//              Mobile money) — Stripe n'accepte pas les cartes guineennes
//   + le Portefeuille Linky quand il est approvisionne, sur les deux profils.
//
// POURQUOI UN SEUL BOUTON LENGOPAY EN GUINEE, ET PAS DEUX. Le client en
// demandait deux : une page carte/wallet d'un cote, un bouton mobile money avec
// saisie du numero et code SMS de l'autre. Le second suppose l'encaissement
// DIRECT (cashin_request), que Lengopay dit desormais possible mais dont nous
// n'avons ni le contrat exact ni les codes operateur — la documentation est
// derriere une « Auth key doc » que nous n'avons pas. Aujourd'hui les deux
// chemins aboutissent litteralement a la MEME page hebergee, ou l'acheteur
// choisit lui-meme entre Carte, Wallet et Mobile Money : afficher deux boutons
// menant au meme endroit mentirait sur ce qui se passe ensuite. Un seul bouton,
// qui dit ce que la page contient vraiment. Le jour ou cashin_request est
// documente, ce fichier est le seul a modifier pour les separer.
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Card } from '../primitives/Card';
import { MicroLabel } from '../lists/SectionHeader';
import { I } from '../../icons/Icon';
import { formatGNF } from '../../lib/format';
import { usePaymentProfile } from '../../lib/paymentProfile';
import type { PaymentMethod } from '../../data/types';

const MOBILE_MONEY_LOGOS: number[] = [
  require('../../../assets/images/pay-orange-money.png'),
  require('../../../assets/images/pay-mtn-momo.png'),
];

/** Valeur envoyee au serveur pour le rail Lengopay (page hebergee).
 *  'orange-money' est conserve tel quel : c'est ce que les trois fonctions edge
 *  acceptent deja, et l'operateur reel se choisit sur la page. Introduire une
 *  nouvelle valeur imposerait de toucher METHODS cote serveur ET les contraintes
 *  CHECK en base, pour un rail dont le comportement est identique. */
export const LENGOPAY_METHOD: PaymentMethod = 'orange-money';

export interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  /** Solde du portefeuille. undefined/null = ne pas proposer le portefeuille
   *  (surface qui ne le supporte pas, ou solde encore inconnu). */
  walletBalanceGnf?: number | null;
  /** false quand la surface n'a pas de rail Stripe cote serveur (le boost, par
   *  exemple, dont create-boost rejette 'card'). Evite d'afficher un bouton qui
   *  echouerait — l'erreur qu'on a deja faite une fois avec la carte. */
  allowCard?: boolean;
}

export function PaymentMethodPicker({
  value,
  onChange,
  walletBalanceGnf,
  allowCard = true,
}: PaymentMethodPickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { profile, loading } = usePaymentProfile();

  // Stripe uniquement pour l'etranger : les cartes guineennes sont refusees par
  // Stripe (constat client 2026-07-26), la carte en Guinee passe par Lengopay.
  const showStripe = allowCard && !loading && profile === 'abroad';
  // Le portefeuille ne s'affiche que s'il peut reellement payer. Un solde a zero
  // affiche est un bouton qui echoue.
  const showWallet = typeof walletBalanceGnf === 'number' && walletBalanceGnf > 0;

  return (
    <>
      {showStripe && (
        <>
          <MicroLabel label={t('checkout.sectionCard')} />
          <MethodRow
            selected={value === 'card'}
            onPress={() => onChange('card')}
            title={t('checkout.cardName')}
            hint={t('checkout.cardHint')}
            icon={<I.card size={18} color={colors.text} />}
          />
        </>
      )}

      <MicroLabel label={t('checkout.sectionMobileMoney')} />
      <MethodRow
        selected={value === LENGOPAY_METHOD || value === 'mtn-money'}
        onPress={() => onChange(LENGOPAY_METHOD)}
        title={profile === 'guinea' ? t('checkout.rails.lengopayGuinea') : t('checkout.rails.mobileMoney')}
        hint={profile === 'guinea' ? t('checkout.rails.lengopayGuineaHint') : t('checkout.rails.mobileMoneyHint')}
        logos={MOBILE_MONEY_LOGOS}
      />

      {showWallet && (
        <>
          <MicroLabel label={t('checkout.sectionOther')} />
          <MethodRow
            selected={value === 'wallet'}
            onPress={() => onChange('wallet')}
            title={t('checkout.walletLinky')}
            hint={t('checkout.walletBalance', { amount: formatGNF(walletBalanceGnf as number) })}
            icon={<I.wallet size={18} color={colors.text} />}
          />
        </>
      )}
    </>
  );
}

function MethodRow({
  selected,
  onPress,
  title,
  hint,
  icon,
  logos,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  hint: string;
  icon?: React.ReactNode;
  logos?: number[];
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <Card padding={14} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {logos ? (
            // Les deux logos cote a cote disent, sans phrase, que ce bouton
            // couvre Orange ET MTN. Fond blanc conserve : les marques des
            // operateurs sont dessinees pour un fond clair.
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {logos.map((src, i) => (
                <Image
                  key={i}
                  source={src}
                  style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#FFFFFF' }}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{title}</Text>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {hint}
            </Text>
          </View>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: selected ? colors.primary : 'transparent',
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

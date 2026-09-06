// Le choix du moyen de paiement, UNE seule fois pour toute l'application.
//
// Client 2026-09-04 : « Unifier les methodes de paiement dans l'appli », apres
// avoir constate que la reservation d'un logement ne proposait AUCUN choix (elle
// sautait directement a un champ telephone) et que le boost en proposait trois
// autres, differents de ceux du panier. Les trois ecrans avaient chacun leur
// propre liste ecrite a la main ; c'est desormais ce composant, et lui seul.
//
// CE QUE CHAQUE PROFIL VOIT — la regle vient du client :
//   etranger : Carte bancaire (Stripe) + Orange Money / MTN (Lengopay)
//   Guinee   : Orange Money / MTN (Lengopay) — Stripe n'accepte pas les cartes
//              guineennes ; la Carte/Wallet Lengopay reste a construire (voir
//              plus bas)
//   + le Portefeuille Linky quand il est approvisionne, sur les deux profils.
//
// ORANGE ET MTN SONT DEUX BOUTONS DEPUIS LE 2026-09-05. Ils n'en faisaient
// qu'un tant que le paiement passait par la page hebergee Lengopay v1 : c'est
// l'acheteur qui y choisissait son operateur, donc afficher deux boutons menant
// au meme endroit aurait menti sur la suite. La doc Lengopay v2 (recuperee dans
// la console marchand ce jour-la) a debloque l'encaissement DIRECT : le
// type_account (lp-om-gn / lp-momo-gn) doit desormais partir avec la requete,
// donc l'operateur doit etre connu AVANT — d'ou deux lignes distinctes.
//
// La partie Carte/Wallet Lengopay pour la Guinee (Paycard, Kulu, Soutra) n'est
// PAS encore branchee : la doc v2 ne decrit rien de specifique pour lp-card-gn,
// et deviner le comportement d'un rail carte avec de l'argent reel serait
// imprudent. Tant que ce n'est pas clarifie, un profil Guinee voit Orange/MTN
// (+ le portefeuille) — jamais un bouton carte qui echouerait.
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

const ORANGE_LOGO: number = require('../../../assets/images/pay-orange-money.png');
const MTN_LOGO: number = require('../../../assets/images/pay-mtn-momo.png');

/** Valeur par defaut du rail mobile money quand un ecran doit en pre-selectionner
 *  une (l'acheteur choisit ensuite Orange ou MTN explicitement — Lengopay v2 a
 *  besoin de l'operateur des le depart, il n'y a plus de page ou le choisir). */
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
        selected={value === 'orange-money'}
        onPress={() => onChange('orange-money')}
        title={t('checkout.rails.orangeMoney')}
        hint={t('checkout.rails.orangeMoneyHint')}
        logos={[ORANGE_LOGO]}
      />
      <MethodRow
        selected={value === 'mtn-money'}
        onPress={() => onChange('mtn-money')}
        title={t('checkout.rails.mtnMoney')}
        hint={t('checkout.rails.mtnMoneyHint')}
        logos={[MTN_LOGO]}
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

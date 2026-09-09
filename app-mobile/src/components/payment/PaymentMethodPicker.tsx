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
//   Guinee   : Carte bancaire (Lengopay) + Kulu + Soutra Money + Orange Money / MTN
//   + le Portefeuille Linky quand il est approvisionne, sur les deux profils.
//
// « Le bouton Carte bancaire "Stripe" SE TRANSFORME » (client 2026-09-05) : le
// meme emplacement, la meme etiquette, un rail different. Jusqu'au 2026-09-07 le
// bouton DISPARAISSAIT pour un profil Guinee — un acheteur guineen n'avait
// aucun moyen de payer par carte. Les deux cartes sont des valeurs de
// PaymentMethod DISTINCTES ('card' vs 'lengopay-card') parce que le serveur ne
// derive pas le pays : usePaymentProfile() est entierement cote client, donc
// c'est le moyen envoye qui decide du rail. Si les deux partageaient 'card', un
// acheteur guineen partirait chez Stripe et se ferait refuser sa carte.
//
// ORANGE ET MTN SONT DEUX BOUTONS DEPUIS LE 2026-09-05. Ils n'en faisaient
// qu'un tant que le paiement passait par la page hebergee Lengopay v1 : c'est
// l'acheteur qui y choisissait son operateur, donc afficher deux boutons menant
// au meme endroit aurait menti sur la suite. La doc Lengopay v2 (recuperee dans
// la console marchand ce jour-la) a debloque l'encaissement DIRECT : le
// type_account (lp-om-gn / lp-momo-gn) doit desormais partir avec la requete,
// donc l'operateur doit etre connu AVANT — d'ou deux lignes distinctes.
//
// KULU depuis le 2026-09-07 (phase 3). Son rail demande un code de validation
// par SMS : l'ecran de saisie (app/checkout/otp.tsx) et lengopay-confirm-otp
// existent desormais, donc un paiement Kulu peut etre TERMINE. Comme Orange et
// MTN, il encaisse SUR un numero guineen — l'ecran appelant doit donc lui
// demander le numero qui paie, au meme titre qu'a eux.
//
// « PAYCARD » n'existe nulle part dans l'API Lengopay — c'est probablement le
// nom commercial de lp-card-gn, mais ce n'est pas verifiable depuis leur doc.
// La ligne s'appelle donc « Carte bancaire », ce qui est vrai dans les deux cas.
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Card } from '../primitives/Card';
import { MicroLabel } from '../lists/SectionHeader';
import { I } from '../../icons/Icon';
import { PAY_LOGOS } from '../../lib/paymentLogos';
import { formatGNF } from '../../lib/format';
import { usePaymentProfile } from '../../lib/paymentProfile';
import type { PaymentMethod } from '../../data/types';

// Meme source que l'ecran de paiement marketplace — voir src/lib/paymentLogos.ts.
const ORANGE_LOGO = PAY_LOGOS.orangeMoney;
const MTN_LOGO = PAY_LOGOS.mtnMomo;

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
  /** false quand la surface n'accepte AUCUN rail carte cote serveur. Evite
   *  d'afficher un bouton qui echouerait — l'erreur qu'on a deja faite une fois
   *  avec la carte.
   *
   *  Attention : ce drapeau eteint les DEUX cartes, Stripe et Lengopay. Depuis
   *  le 2026-09-07 le meme bouton sert les deux profils, donc le passer a false
   *  prive aussi les profils Guinee de leur seul moyen carte. Plus aucun
   *  appelant ne le passe : create-boost, place-order, place-orders-batch et
   *  booking-sign-pay acceptent tous la carte. */
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
  // `loading` compte : tant que le profil est inconnu on n'affiche AUCUNE des
  // deux cartes, plutot que d'en montrer une au hasard et d'envoyer l'argent
  // sur le mauvais rail.
  const showStripe = allowCard && !loading && profile === 'abroad';
  const showLengopayCard = allowCard && !loading && profile === 'guinea';
  // Kulu et Soutra Money sont des portefeuilles guineens : aucun sens a l'etranger.
  const showGuineaWallets = !loading && profile === 'guinea';
  // Le portefeuille ne s'affiche que s'il peut reellement payer. Un solde a zero
  // affiche est un bouton qui echoue.
  const showWallet = typeof walletBalanceGnf === 'number' && walletBalanceGnf > 0;

  return (
    <>
      {(showStripe || showLengopayCard) && (
        <>
          <MicroLabel label={t('checkout.sectionCard')} />
          <MethodRow
            // Un seul des deux est vrai a la fois (profile est 'abroad' XOR
            // 'guinea'), donc une seule ligne « Carte bancaire » s'affiche.
            selected={value === (showStripe ? 'card' : 'lengopay-card')}
            onPress={() => onChange(showStripe ? 'card' : 'lengopay-card')}
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

      {/* Kulu : portefeuille guineen. Encaisse sur un numero (comme Orange et
          MTN), et se valide par un code recu par SMS. */}
      {showGuineaWallets && (
        <MethodRow
          selected={value === 'kulu'}
          onPress={() => onChange('kulu')}
          title={t('checkout.rails.kulu')}
          hint={t('checkout.rails.kuluHint')}
          icon={<I.wallet size={18} color={colors.text} />}
        />
      )}

      {/* Soutra Money : portefeuille guineen, paye sur sa propre page web (pas
          de numero a saisir ici — l'acheteur s'y identifie lui-meme). */}
      {showGuineaWallets && (
        <MethodRow
          selected={value === 'soutramoney'}
          onPress={() => onChange('soutramoney')}
          title={t('checkout.rails.soutraMoney')}
          hint={t('checkout.rails.soutraMoneyHint')}
          icon={<I.wallet size={18} color={colors.text} />}
        />
      )}

      {/* PayCard : carte prepayee guineenne. Elle exige un numero de compte EN
          PLUS du telephone — l'ecran qui affiche ce selecteur DOIT donc rendre
          un champ de saisie quand elle est choisie, sans quoi le bouton payer
          echouerait sur un CARD_NUMBER_REQUIRED sans rien a corriger. */}
      {showGuineaWallets && (
        <MethodRow
          selected={value === 'paycard'}
          onPress={() => onChange('paycard')}
          title={t('checkout.rails.paycard')}
          hint={t('checkout.rails.paycardHint')}
          icon={<I.card size={18} color={colors.text} />}
        />
      )}

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

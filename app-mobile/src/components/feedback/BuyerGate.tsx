// Le verrou « mode Acheteur » — une feuille qui explique, plutôt qu'un bouton
// mort.
//
// DEMANDE DU CLIENT, 2026-09-08 23:01 : « On ne peut pas faire de commande ni
// louer si le mode Acheteur n'est pas activé. » La règle vit dans
// src/lib/persona.ts (`canBuy`) ; ce fichier n'en est que la surface visible.
//
// POURQUOI EXPLIQUER AU LIEU DE MASQUER. Le message précédent du client (23:00)
// demandait au contraire de FAIRE DISPARAÎTRE le panier et les favoris de
// l'en-tête en mode Vendeur ou Immo, et c'est ce qui a été fait. Les deux ne se
// contredisent pas :
//
//   la chrome permanente — un panier, un cœur, posés là en haut de l'écran —
//   ne promet rien de précis ; sans le rôle acheteur elle ne mène nulle part,
//   donc elle part ;
//
//   un geste délibéré — appuyer sur « Réserver », sur « Ajouter au panier » —
//   est une intention. Y répondre par un bouton grisé, ou par rien du tout,
//   laisse quelqu'un devant un écran qui refuse sans dire pourquoi. C'est
//   exactement la situation que le client décrivait le matin même : « il faut
//   activer le profil acheteur pour pouvoir faire ça » — une phrase qu'il
//   fallait bien que l'application dise elle-même.
//
// UN FOURNISSEUR PLUTÔT QU'UN HOOK LOCAL. Une feuille montée par chaque écran
// obligerait chaque appelant à penser à la rendre, et on l'oublierait au
// premier écran ajouté — le bouton redeviendrait silencieusement ouvert. Ici,
// `requireBuyer()` suffit : la feuille est déjà montée à la racine, comme le
// Toast.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { Sheet } from '../sheets/Sheet';
import { I } from '../../icons/Icon';
import { haptic } from '../../lib/haptics';
import { useAuth } from '../../stores/auth';
import { canBuy } from '../../lib/persona';

interface BuyerGateValue {
  /**
   * À appeler AVANT toute action qui engage de l'argent : commander, payer,
   * louer, réserver une visite.
   *
   * Rend `true` si le compte a le rôle acheteur — l'appelant continue. Rend
   * `false` sinon, en ayant ouvert la feuille d'explication : l'appelant sort
   * sans rien faire d'autre.
   *
   *   onPress={() => { if (!requireBuyer()) return; ...suite... }}
   */
  requireBuyer: () => boolean;
}

const BuyerGateContext = createContext<BuyerGateValue | null>(null);

export function BuyerGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Les rôles sont lus au MOMENT DU CLIC via getState(), pas par un abonnement.
  // Deux raisons : l'identité de `requireBuyer` reste stable, donc le contexte
  // ne fait pas re-rendre toute l'application à chaque changement de rôle ; et
  // la valeur lue est forcément la plus fraîche, y compris juste après un
  // aller-retour par « Mes rôles ».
  const requireBuyer = useCallback(() => {
    if (canBuy(useAuth.getState().roles)) return true;
    haptic.light();
    setOpen(true);
    return false;
  }, []);

  const value = useMemo(() => ({ requireBuyer }), [requireBuyer]);

  return (
    <BuyerGateContext.Provider value={value}>
      {children}
      {/* LE CADRE COMPTE. `Sheet` repose sur BottomSheet (gorhom) rendu SUR
          PLACE, pas sur un modal portalise — le fichier porte l'avertissement
          explicite : un essai via BottomSheetModal et le portail racine avait
          rendu TOUTES les feuilles inertes chez le client (2026-08-11). Or
          gorhom mesure sa hauteur sur son parent, et ici le parent est la
          racine de l'application, pas un ecran.
          D'ou cette enveloppe en position absolue : elle reprend exactement le
          cadre de son parent, comme le conteneur des toasts qui vit au meme
          endroit de l'arbre et fonctionne en production. `box-none` la rend
          transparente aux gestes — feuille fermee, elle n'intercepte rien, et
          `Sheet` ne rend meme rien tant qu'elle est fermee. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <BuyerGateSheet open={open} onClose={() => setOpen(false)} />
      </View>
    </BuyerGateContext.Provider>
  );
}

export function useBuyerGate(): BuyerGateValue {
  const c = useContext(BuyerGateContext);
  if (!c) throw new Error('useBuyerGate must be used within BuyerGateProvider');
  return c;
}

function BuyerGateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, radii } = useTheme();
  const { t } = useTranslation();

  const goToRoles = () => {
    haptic.light();
    // On ferme AVANT de naviguer : une feuille encore montée pendant la
    // transition de pile reste visible derrière l'écran suivant sur certains
    // Android — le même piège que la feuille de choix photo.
    onClose();
    router.push('/profil/roles');
  };

  return (
    <Sheet open={open} onClose={onClose} reserveTabBar={false} fitContent>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: radii.lg,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <I.cart size={24} color={colors.primaryDeep} />
        </View>
        <Text variant="titleM" style={{ marginBottom: 6 }}>
          {t('buyerGate.title')}
        </Text>
        <Text variant="bodyM" tone="muted" style={{ letterSpacing: 0, lineHeight: 21, marginBottom: 20 }}>
          {t('buyerGate.body')}
        </Text>

        <Button variant="dark" size="lg" block label={t('buyerGate.cta')} onPress={goToRoles} />

        {/* « Plus tard » reste discret : la feuille se ferme aussi en tirant
            vers le bas ou en touchant le voile. */}
        <Pressable
          onPress={() => {
            haptic.light();
            onClose();
          }}
          style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center' }}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textMuted }}>
            {t('buyerGate.later')}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

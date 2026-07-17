import { Linking, ScrollView, View } from 'react-native';

import { logger } from '@/shared/lib/logger';
import { AppText, Button, Card, Screen } from '@/shared/ui';

// Linky support channels — replace with the real ones before release.
const SUPPORT_EMAIL = 'support@linkygroup.com';
const SUPPORT_WHATSAPP = '224620000000'; // digits only, country code first (no +)

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Comment je reçois des livraisons ?',
    a: 'Les courses te sont assignées par l’équipe Linky. Active « En ligne » sur l’accueil pour signaler ta disponibilité — tu reçois une notification dès qu’une livraison t’est attribuée.',
  },
  {
    q: 'Comment confirmer une livraison ?',
    a: 'Ouvre la livraison, appuie sur « J’ai récupéré le colis » à la boutique, puis à la remise scanne le QR code affiché sur le téléphone du client. Le scan confirme la livraison et libère le paiement du vendeur.',
  },
  {
    q: 'Comment voir le trajet ?',
    a: 'Sur une livraison, appuie sur « Voir l’itinéraire » : la carte affiche le trajet jusqu’au client et le temps estimé, mis à jour pendant que tu roules.',
  },
  {
    q: 'À quoi sert « En ligne / Hors ligne » ?',
    a: 'Le bouton en haut de l’accueil indique à l’équipe Linky si tu es disponible. Passe « Hors ligne » quand tu ne peux pas prendre de course.',
  },
  {
    q: 'Le paiement des livreurs',
    a: 'Les modalités de paiement sont gérées par l’équipe Linky. Contacte le support pour toute question sur tes paiements.',
  },
  {
    q: 'Puis-je utiliser mon compte client Linky ?',
    a: 'Non — un compte livreur utilise une adresse email différente de ton compte client Linky. Les deux ne se mélangent pas.',
  },
];

function open(url: string) {
  void Linking.openURL(url).catch((e) => logger.warn('[help] openURL failed', e));
}

/**
 * Aide & support — contact channels (email / WhatsApp) + a driver-focused FAQ.
 * Reached from Profil; required-ish for store readiness (a discoverable support path).
 */
export function HelpScreen() {
  return (
    <Screen testID="help-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-10 pt-4">
        <View className="gap-1">
          <AppText variant="display">Aide & support</AppText>
          <AppText variant="caption" className="text-ink-muted">
            Une question ? On est là pour t’aider.
          </AppText>
        </View>

        <View className="gap-2">
          <Button
            testID="help-email"
            label="Écrire par email"
            onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}
          />
          <Button
            testID="help-whatsapp"
            variant="secondary"
            label="Contacter sur WhatsApp"
            onPress={() => open(`https://wa.me/${SUPPORT_WHATSAPP}`)}
          />
        </View>

        <View className="gap-3">
          <AppText variant="label">Questions fréquentes</AppText>
          {FAQ.map((item, i) => (
            <Card key={item.q} className="gap-1.5" testID={`help-faq-${i}`}>
              <AppText variant="label">{item.q}</AppText>
              <AppText variant="body" className="text-ink-muted">
                {item.a}
              </AppText>
            </Card>
          ))}
        </View>

        <AppText variant="caption" className="text-center text-ink-faint">
          Linky Livreur
        </AppText>
      </ScrollView>
    </Screen>
  );
}

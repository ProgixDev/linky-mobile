import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Card } from '../primitives/Card';
import { NotificationRow } from '../notifications/NotificationRow';
import { useNotifications } from '../../data/queries/messages';
import { Skeleton } from '../primitives/Skeleton';
import { haptic } from '../../lib/haptics';

// « ET LES NOTIFICATIONS » — la seconde demande du client pour l'Accueil
// (2026-09-28), à côté du tableau de bord.
//
// ┌─ POURQUOI CE N'EST PAS UN APPEL DE PLUS ────────────────────────────────┐
// La cloche de l'en-tête appelle déjà `useUnreadNotificationsCount()`, qui
// partage la clé `['notifications']` et le MÊME chargeur que `useNotifications()`.
// Cette section lit donc un cache déjà rempli : zéro requête supplémentaire sur
// un réseau où chaque aller-retour se paie.
//
// C'est aussi pourquoi elle ne pagine pas : la cloche n'a jamais chargé qu'une
// page. Le « Tout voir » mène à l'écran, qui lui pagine vraiment.
// └─────────────────────────────────────────────────────────────────────────┘

/** Trois : assez pour dire ce qui s'est passé, pas assez pour repousser le
 *  reste de l'Accueil sous la ligne de flottaison. */
const SHOWN = 3;

export function HomeActivity() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, isError } = useNotifications();
  const items = (data ?? []).slice(0, SHOWN);

  // RIEN À DIRE = RIEN À MONTRER. Une section « Activité » vide sur la première
  // page donnerait à un compte neuf l'impression d'un écran cassé ; un encart
  // « aucune notification » occuperait la place sans rien apporter. On disparaît
  // aussi en cas d'erreur : l'Accueil doit rester lisible même quand cette
  // requête-là échoue.
  if (isError) return null;
  if (!isLoading && items.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700' }}>{t('home.activitySection')}</Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.push('/notifications');
          }}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
            {t('home.seeAll')}
          </Text>
        </Pressable>
      </View>

      <Card padding={14}>
        {isLoading ? (
          <View style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={38} radius={10} />
            ))}
          </View>
        ) : (
          items.map((n, i) => (
            // Le trait de la DERNIÈRE ligne flotterait sous la carte au lieu de
            // séparer quoi que ce soit.
            <NotificationRow key={n.id} item={n} divider={i < items.length - 1} />
          ))
        )}
      </Card>
    </View>
  );
}

import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Users, LayoutGrid, ShoppingBag, CalendarCheck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { useAppStats } from '../../data/queries';

/**
 * « Les statistiques de l'application : nombre d'utilisateurs, nombre
 * d'annonces en ligne, nombre de ventes et de réservations réalisées »
 * (client 2026-10-25).
 *
 * Le serveur ne renvoie un compteur qu'une fois son seuil atteint (voir
 * supabase/functions/app-stats). Ce composant n'affiche donc que les tuiles
 * présentes, et RIEN DU TOUT tant qu'aucune ne l'est : un encart vide ou à
 * moitié rempli sur la première page ferait croire à un écran cassé.
 * Une erreur réseau donne le même résultat : ces chiffres sont un plus, jamais
 * une raison d'afficher un message d'erreur sur l'accueil.
 */
export function HomeStats() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { data } = useAppStats();
  if (!data) return null;

  const tiles: { Icon: LucideIcon; value: number; label: string }[] = [];
  if (data.users != null) tiles.push({ Icon: Users, value: data.users, label: t('home.statsUsers') });
  if (data.listings != null) tiles.push({ Icon: LayoutGrid, value: data.listings, label: t('home.statsListings') });
  if (data.sales != null) tiles.push({ Icon: ShoppingBag, value: data.sales, label: t('home.statsSales') });
  if (data.bookings != null) tiles.push({ Icon: CalendarCheck, value: data.bookings, label: t('home.statsBookings') });
  if (tiles.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
        {t('home.statsTitle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map(({ Icon, value, label }) => (
          <View
            key={label}
            style={{
              // Deux par rangée : quatre tuiles sur une seule ligne rendraient
              // les libellés illisibles sur un petit écran.
              flexBasis: '47%',
              flexGrow: 1,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 18,
              padding: 14,
              gap: 6,
            }}
          >
            <Icon size={18} color={colors.primary} strokeWidth={2} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{groupDigits(value)}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 12 400 plutôt que 12400. Écrit à la main : le moteur JavaScript d'Android
 *  n'embarque pas toujours les données de langue de toLocaleString. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

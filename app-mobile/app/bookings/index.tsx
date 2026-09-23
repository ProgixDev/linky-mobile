// Tenant's rental bookings list (location par jour / par mois).
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { ErrorStateView } from '../../src/components/feedback/EmptyState';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { BookingCard } from '../../src/components/booking/BookingUI';
import { useMyBookings } from '../../src/data/queries';
import { FilterChips } from '../../src/components/nav/FilterChips';
import { filterBookings, useBookingFilterChips, type BookingFilter } from '../../src/lib/bookingFilters';
import { addMonthsClamped } from '../../src/lib/dates';
import type { Booking } from '../../src/data/types';

// DEMANDE DU CLIENT, 2026-09-09 : « On pourra rajouter un filtre ici comme pour
// la partie Commandes ». Les cases et leurs libelles vivent dans
// src/lib/bookingFilters.ts, partages avec l'ecran « Reservations » de l'agent :
// les deux parties d'une meme location doivent lire le meme etat.

export default function BookingsRoute() {
  const { colors } = useTheme();
  const q = useMyBookings();
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const bookings = q.data ?? [];

  // PROLONGER — ce que l'on refuse de proposer, et pourquoi.
  //
  // * une prolongation VIVANTE existe deja : reproposer le bouton produisait une
  //   seconde demande identique. Le bailleur en recevait deux, acceptait la
  //   premiere, et se prenait un 409 « ces dates ne sont plus disponibles » sur
  //   la seconde — pour son propre locataire, sur un bien que personne d'autre
  //   n'avait reserve ;
  // * le terme du bail est deja passe (cas d'un bail reste 'paid' faute de
  //   confirmation d'emmenagement, que rien ne termine) : la reprise tomberait
  //   dans le passe et le serveur refuserait. Autant ne rien proposer.
  const all = q.data ?? [];
  const hasLiveExtension = (id: string) =>
    all.some((x) => x.extendsBookingId === id
      && ['requested', 'accepted', 'paid', 'active', 'disputed'].includes(x.status));
  const extendHandler = (b: Booking) => {
    if (b.status !== 'active' && b.status !== 'paid') return undefined;
    if (hasLiveExtension(b.id)) return undefined;
    if (b.period === 'day') return () => router.push(`/property/${b.propertyId}/book` as never);
    if (b.period !== 'month' || !b.months) return undefined;
    if (addMonthsClamped(b.startDate, b.months) <= new Date().toISOString().slice(0, 10)) return undefined;
    return () => router.push(`/property/${b.propertyId}/book?extend=${b.id}` as never);
  };
  const FILTERS = useBookingFilterChips();
  const filtered = filterBookings(bookings, filter);

  if (q.isError && bookings.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Mes réservations" subtitle="Tes locations en cours." />
        <ErrorStateView onRetry={() => void q.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <ScreenHeader title="Mes réservations" subtitle="Tes locations en cours." />
        {/* Les pastilles n'apparaissent qu'une fois qu'il y a quelque chose a
            filtrer : au chargement, et sur un compte sans aucune reservation,
            elles ne feraient que promettre un tri de rien. */}
        {!q.isLoading && bookings.length > 0 && (
          <FilterChips chips={FILTERS} value={filter} onChange={setFilter} />
        )}
        {q.isLoading ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
            <Skeleton height={92} radius={18} />
            <Skeleton height={92} radius={18} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: colors.bgSunken, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={24} color={colors.textMuted} strokeWidth={1.75} />
            </View>
            {/* DEUX VIDES DIFFERENTS. « Aucune reservation » s'adresse a
                quelqu'un qui n'en a jamais fait ; l'afficher parce qu'un filtre
                ne renvoie rien lui dirait que ses locations ont disparu. */}
            {bookings.length === 0 ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>Aucune réservation</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
                  Trouve un logement en location et réserve-le directement dans l'app.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>Rien dans ce filtre</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
                  Tes autres réservations sont dans « {FILTERS[0].label} ».
                </Text>
              </>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 10 }}>
            {filtered.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onPress={() => router.push(`/bookings/${b.id}` as never)}
                // « PROLONGER » (client 2026-09-23) — renvoie au calendrier du
                // bien, ou le locataire choisit ses nouvelles dates. Ce n'est
                // pas une modification de la reservation en cours : c'en est une
                // nouvelle, avec son contrat et son paiement. Le calendrier
                // refuse deja les dates deja occupees.
                //
                // SEULEMENT SUR UN SEJOUR A LA JOURNEE EN COURS. 'paid' est
                // ecarte — on n'a pas encore emmenage, il n'y a rien a
                // prolonger ; 'disputed' aussi — proposer d'allonger un sejour
                // en litige serait deplace. C'est exactement l'etiquette
                // « Bail actif » que le client montrait sur sa capture.
                //
                // LE MOIS EST EXCLU, ET CE N'EST PAS UN OUBLI. Au paiement d'un
                // bail mensuel, le bien passe en 'reserved' (20260706_01), et
                // booking-request refuse toute demande sur un bien qui n'est pas
                // 'active' : PROPERTY_INACTIVE, « Cette annonce n'est plus
                // disponible ». Le bouton enverrait donc le locataire vers un
                // calendrier qui finit en erreur. Prolonger un bail au mois
                // demande une regle serveur — autoriser le locataire EN PLACE a
                // reserver son propre bien reserve — qui n'existe pas encore.
                // PROLONGER (client 2026-09-18) : « quand le statut de la
                // reservation est en "Actives", rajouter un bouton "Prolonger"
                // qui renvoie vers le calendrier de reservation ». Le mensuel
                // passe le parametre `extend` : le calendrier verrouille alors
                // la date de depart sur la fin du bail en cours, et le serveur
                // la recalcule de son cote sans faire confiance a l'ecran.
                // 'paid' compte autant qu"'active' : le bail est deja paye,
                // seule la confirmation d'emmenagement manque.
                onExtend={extendHandler(b)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Chip } from '../src/components/primitives/Chip';
import { TopBar } from '../src/components/nav/TopBar';
import { useMarkNotificationsRead } from '../src/data/queries';
import { useNotificationsInfinite } from '../src/data/queries/messages';
import { Button } from '../src/components/primitives/Button';
import type { AppNotification } from '../src/data/types';
import { NotificationRow } from '../src/components/notifications/NotificationRow';
import { EmptyState, ErrorStateView } from '../src/components/feedback/EmptyState';
import { Skeleton } from '../src/components/primitives/Skeleton';

type Tab = 'all' | 'order' | 'message' | 'booking' | 'promo';

// TOUTES les pastilles sont montrees a tout le monde depuis le 2026-09-08.
//
// Elles etaient calees sur la persona (client 2026-07-07 : « les alertes d'un
// vendeur ne sont pas celles d'un agent ») : 'order' masquee a l'agent pur,
// 'visit' et 'booking' masquees au vendeur pur. Ce raisonnement supposait
// qu'un vendeur ne loue pas et qu'un agent n'achete pas — ce qui n'a jamais
// ete vrai cote serveur, et ne l'est plus du tout depuis que les deux
// categories sont ouvertes a toutes les personas sur Annonces et Decouvrir.
//
// Le symptome : un vendeur qui reserve un logement RECEVAIT bien les alertes
// 'booking', mais n'avait aucune pastille pour les retrouver — il devait les
// pecher dans « Toutes ». Une pastille vide ne coute rien ; une alerte qu'on
// ne sait pas retrouver, si.
//
// Regle a retenir : un filtre doit porter sur ce que l'utilisateur RECOIT,
// jamais sur l'etiquette de persona qu'il porte.
const TAB_DEFS: { key: Tab; labelKey: string }[] = [
  { key: 'all', labelKey: 'notifications.filterAll' },
  { key: 'order', labelKey: 'notifications.filterOrder' },
  { key: 'message', labelKey: 'notifications.filterMessage' },
  // « Visites » retiree le 2026-09-09 avec la fonctionnalite. Les alertes deja
  // recues gardent leur categorie et restent lisibles dans « Toutes » — on
  // retire le filtre, pas l'historique.
  { key: 'booking', labelKey: 'notifications.filterBooking' },
  { key: 'promo', labelKey: 'notifications.filterPromo' },
];


export default function NotificationsRoute() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Phase U.5 — infinite pagination. The screen used to cap at the newest
  // 30 (the first page) and discarded the next_cursor.
  const notifQuery = useNotificationsInfinite();
  const items: AppNotification[] = useMemo(() => {
    const pages = notifQuery.data?.pages ?? [];
    return pages.flatMap((p) =>
      p.notifications.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        body: n.body,
        at: n.created_at,
        read: n.read_at !== null,
        iconHint: n.icon_hint,
        // Pre-fix, the deeplink was fetched then dropped here — every row
        // rendered as a dead View. Rows now navigate like a push tap does.
        deeplink: n.deeplink,
      })),
    );
  }, [notifQuery.data]);
  const markRead = useMarkNotificationsRead();
  const [tab, setTab] = useState<Tab>('all');

  // Plus aucun filtrage par role : toutes les pastilles, pour tout le monde.
  // Le repli « si l'onglet actif est masque pour ce role, revenir a Toutes »
  // n'a plus d'objet — aucune pastille ne peut disparaitre.
  const visibleTabs = TAB_DEFS;

  useEffect(() => {
    // Mark all read on view
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((n) => (tab === 'all' ? true : n.category === tab));

  const grouped: { today: AppNotification[]; week: AppNotification[] } = {
    today: [],
    week: [],
  };
  // "Aujourd'hui" = since local midnight, not a rolling 24h window — a 9am
  // notification should still read as "Aujourd'hui" at 11pm the same day.
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  for (const n of filtered) {
    if (new Date(n.at).getTime() >= midnightMs) grouped.today.push(n);
    else grouped.week.push(n);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title={t('notifications.title')}
        back
        /* Phase U.0d — the gear lied : /settings is the Language picker,
            no notification-prefs screen exists in V1. Removed rather
            than mislabelled. */
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={notifQuery.isFetching && !notifQuery.isLoading}
            onRefresh={() => void notifQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* Phase U.0 should-fix — exclusive error : grouped sections must
            NOT render alongside the error view, and loading state shows
            real skeleton rows instead of nothing. U.0d — gate on "no
            cached data" so a failed pull-to-refresh keeps the cached
            list visible. */}
        {notifQuery.isError && items.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <ErrorStateView onRetry={() => void notifQuery.refetch()} />
          </View>
        ) : notifQuery.isLoading ? (
          <View style={{ gap: 10, paddingTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={64} radius={16} />
            ))}
          </View>
        ) : (
          <>
            {/* Phase U.0d — chips inside the non-error arm. They were
                rendering interactive-but-useless above the error state. */}
            {/* Les pastilles debordent volontairement jusqu'aux bords de
                l'ecran : enfermees dans les 16 px du parent, la derniere se
                trouvait tranchee net (« Bookin| ») sans marge, ce qui se lit
                comme un defaut d'affichage plutot que comme « ca defile ».
                Marge negative + rembourrage interne : le contenu reste aligne
                sur les lignes en dessous, mais la coupe se fait au bord. */}
            <View style={{ paddingBottom: 12, marginHorizontal: -16 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
              >
                {visibleTabs.map((d) => (
                  <Chip
                    key={d.key}
                    label={t(d.labelKey)}
                    active={tab === d.key}
                    onPress={() => setTab(d.key)}
                  />
                ))}
              </ScrollView>
            </View>
            {filtered.length === 0 && (
              <EmptyState
                icon="bell"
                title={items.length === 0 ? t('notifications.emptyTitle') : t('notifications.emptyInFilterTitle')}
                description={
                  items.length === 0
                    ? t('notifications.emptySub')
                    : t('notifications.emptyInFilterSub')
                }
              />
            )}
            {grouped.today.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 14, marginBottom: 6 }}>
                  {t('notifications.today')}
                </Text>
                {grouped.today.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
            )}
            {grouped.week.length > 0 && (
              <>
                <Text variant="micro" tone="muted" style={{ marginTop: 14, marginBottom: 6 }}>
                  {t('notifications.thisWeek')}
                </Text>
                {grouped.week.map((n) => (
                  <NotificationRow key={n.id} item={n} />
                ))}
              </>
            )}
            {/* Phase U.5 — pagination via next_cursor. Hidden when there's
                no next page. Loading state ensures the user knows it's
                fetching ; mark-read semantics untouched. */}
            {notifQuery.hasNextPage && (
              <View style={{ paddingTop: 18, alignItems: 'center' }}>
                <Button
                  variant="outline"
                  size="md"
                  label={t('notifications.loadMore')}
                  loading={notifQuery.isFetchingNextPage}
                  disabled={notifQuery.isFetchingNextPage}
                  onPress={() => void notifQuery.fetchNextPage()}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Date relative TRADUITE. `formatRelativeFR` ecrivait « Hier » / « Il y a 2j »
// en dur, si bien qu'une interface en anglais affichait « THIS WEEK » au-dessus
// de « Hier » — deux langues sur trois lignes d'ecran.
// Intl.RelativeTimeFormat n'est pas garanti par Hermes : on passe par i18n,
// qui l'est.


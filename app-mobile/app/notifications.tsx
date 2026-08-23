import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../src/theme/ThemeProvider';
import { Text } from '../src/components/primitives/Text';
import { Chip } from '../src/components/primitives/Chip';
import { TopBar } from '../src/components/nav/TopBar';
import { I, type IconKey } from '../src/icons/Icon';
import { useMarkNotificationsRead } from '../src/data/queries';
import { useNotificationsInfinite } from '../src/data/queries/messages';
import { useAuth } from '../src/stores/auth';
import { Button } from '../src/components/primitives/Button';
import type { AppNotification } from '../src/data/types';
import { EmptyState, ErrorStateView } from '../src/components/feedback/EmptyState';
import { Skeleton } from '../src/components/primitives/Skeleton';

type Tab = 'all' | 'order' | 'message' | 'visit' | 'booking' | 'promo';

// Filter tabs are role-aware (client 2026-07-07): a seller's alerts aren't an
// agent's or a buyer's. 'order' (product orders) is hidden from a PURE agent;
// 'visit' (property visits) is hidden from a PURE seller. 'all' / 'message' /
// 'promo' are universal. The 'all' tab still shows everything the user
// actually receives, so nothing is ever hidden from view — only the filter
// chips adapt.
const TAB_DEFS: { key: Tab; labelKey: string; show: (r: { buyer: boolean; seller: boolean; agent: boolean }) => boolean }[] = [
  { key: 'all', labelKey: 'notifications.filterAll', show: () => true },
  { key: 'order', labelKey: 'notifications.filterOrder', show: (r) => r.buyer || r.seller },
  { key: 'message', labelKey: 'notifications.filterMessage', show: () => true },
  { key: 'visit', labelKey: 'notifications.filterVisit', show: (r) => r.buyer || r.agent },
  // 'booking' (rental reservations) existed as a notification category on the
  // server but had no chip, so those alerts were only reachable from « Toutes »
  // (client 2026-08-05). Same audience as 'visit': the tenant and the landlord.
  { key: 'booking', labelKey: 'notifications.filterBooking', show: (r) => r.buyer || r.agent },
  { key: 'promo', labelKey: 'notifications.filterPromo', show: () => true },
];

const ICON_FOR: Record<string, IconKey> = {
  check: 'check',
  msg: 'msg',
  bolt: 'bolt',
  star: 'star',
  heart: 'heart',
  shield: 'shield',
};

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

  // Role-aware filter chips.
  const roles = useAuth((s) => s.roles);
  const roleFlags = {
    buyer: roles.includes('buyer'),
    seller: roles.includes('seller'),
    agent: roles.includes('agent'),
  };
  const visibleTabs = TAB_DEFS.filter((d) => d.show(roleFlags));
  // If the active tab is hidden for this role, fall back to 'all'.
  useEffect(() => {
    if (!visibleTabs.some((d) => d.key === tab)) setTab('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

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
function relativeLabel(at: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const d = new Date(at);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return t('notifications.timeNow');
  if (mins < 60) return t('notifications.timeMinutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.timeHours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('notifications.timeYesterday');
  if (days < 7) return t('notifications.timeDays', { count: days });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function NotificationRow({ item }: { item: AppNotification }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const Icon = I[ICON_FOR[item.iconHint] ?? 'info'];
  // NOTE: the theme has no info-soft / success-soft tokens (only primarySoft
  // and accentSoft), so message/visit tints keep a low-alpha rgba() of the
  // theme's info/success hues. Add `infoSoft`/`successSoft` to tokens.ts to
  // make these fully theme-driven.
  const tint =
    item.category === 'order'
      ? { bg: colors.primarySoft, fg: colors.primary }
      : item.category === 'message'
        ? { bg: 'rgba(58,124,168,0.1)', fg: colors.info }
        : item.category === 'visit'
          ? { bg: 'rgba(31,169,113,0.12)', fg: colors.success }
          : item.category === 'promo'
            ? { bg: colors.accentSoft, fg: colors.accentText }
            : { bg: colors.bgSunken, fg: colors.text };
  // Same guard as the push-tap handler (push.ts): only in-app routes.
  const canOpen = typeof item.deeplink === 'string' && item.deeplink.startsWith('/');
  // Une seule constante pour la colonne d'icone : le retrait du separateur en
  // dessous doit tomber EXACTEMENT sous le texte. Deux valeurs ecrites a la
  // main finiraient par diverger d'un pixel ou deux, et c'est precisement ce
  // genre d'ecart qui donne l'impression d'une liste mal alignee.
  const ICON = 38;
  const GAP = 12;
  return (
    <View>
      <Pressable
        disabled={!canOpen}
        onPress={() => {
          if (canOpen) router.push(item.deeplink as never);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: GAP,
          paddingVertical: 12,
          // L'icone se centre sur la hauteur de la ligne plutot que de se
          // coller en haut : avec des corps de 1 a 3 lignes, un alignement
          // haut donnait des pastilles a des hauteurs toutes differentes.
          alignItems: 'center',
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <View
          style={{
            width: ICON,
            height: ICON,
            borderRadius: 999,
            backgroundColor: tint.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={17} color={tint.fg} />
        </View>
        {/* minWidth: 0 — sans lui, un titre long refuse de se laisser tronquer
            et pousse la pastille « non lu » hors de l'ecran. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>
              {item.title}
            </Text>
            {/* La pastille se pose sur la ligne du titre. Elle flottait avant
                avec une marge haute fixe, donc jamais a la meme hauteur selon
                la longueur du corps. */}
            {!item.read && (
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary }} />
            )}
          </View>
          <Text
            variant="caption"
            tone="muted"
            numberOfLines={2}
            style={{ marginTop: 2, lineHeight: 17, letterSpacing: 0 }}
          >
            {item.body}
          </Text>
          <Text variant="micro" tone="faint" style={{ marginTop: 4, letterSpacing: 0, textTransform: 'none' }}>
            {relativeLabel(item.at, t)}
          </Text>
        </View>
      </Pressable>
      {/* Separateur en retrait, aligne sur le texte et non sur l'icone : c'est
          ce qui fait lire la colonne de titres comme une vraie colonne. */}
      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: ICON + GAP }} />
    </View>
  );
}

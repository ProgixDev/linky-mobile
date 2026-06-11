// Phase T.4 / U.0 — production-grade messages list.
//
// U.0 should-fixes incorporated (S1-S5):
//   S1: chips become Toutes / Annonces / Immobilier. The Achats/Ventes
//       split based on lastMessageSenderId was wrong (drops a sale the
//       moment the buyer replies, which is exactly when it's unread).
//       Real split needs server-side listing-owner stitching - V1.1.
//   S2: error doesn't wipe the cached list ; only show ErrorStateView
//       when there's no data to fall back on.
//   S3: real skeleton rows during isLoading instead of rendering null.
//   S4: refresh state is local (try/finally) — the polling 60s
//       isFetching was making the spinner self-fire forever.
//   S5: keyboardShouldPersistTaps='handled' so a tap on a conversation
//       while the search input is focused goes through on the first
//       tap (default 'never' eats it dismissing the keyboard).
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Avatar } from '../primitives/Avatar';
import { Chip } from '../primitives/Chip';
import { TopBar } from '../nav/TopBar';
import { IconButton } from '../primitives/Button';
import { Skeleton } from '../primitives/Skeleton';
import { I } from '../../icons/Icon';
import { useConversations } from '../../data/queries';
import { formatRelativeFR } from '../../lib/format';
import { EmptyState, ErrorStateView } from '../feedback/EmptyState';

type Filter = 'all' | 'product' | 'real-estate';

export default function MessagesListScreen() {
  const { colors } = useTheme();
  const convQuery = useConversations();
  const convs = convQuery.data;
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await convQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [convQuery]);

  const filtered = useMemo(() => {
    const base = convs ?? [];
    const trimmed = search.trim().toLowerCase();
    return base.filter((c) => {
      if (filter === 'real-estate' && c.pinnedListingKind !== 'property') return false;
      if (filter === 'product' && c.pinnedListingKind !== 'product') return false;
      if (trimmed.length > 0) {
        const name = (c.otherUserDisplayName ?? '').toLowerCase();
        const last = (c.lastMessage ?? '').toLowerCase();
        if (!name.includes(trimmed) && !last.includes(trimmed)) return false;
      }
      return true;
    });
  }, [convs, filter, search]);

  const toggleSearch = () => {
    if (searchOpen) setSearch('');
    setSearchOpen((o) => !o);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title="Messages"
        back
        right={
          <IconButton
            variant="secondary"
            size={36}
            hitSlop={6}
            onPress={toggleSearch}
          >
            <I.search size={16} color={colors.text} />
          </IconButton>
        }
      />

      {searchOpen && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={{
              height: 44,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              gap: 8,
            }}
          >
            <I.search size={14} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cherche un nom ou un message…"
              placeholderTextColor={colors.textFaint}
              autoFocus
              style={{ flex: 1, fontSize: 14, color: colors.text, padding: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={14}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                  Effacer
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Toutes" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Annonces" active={filter === 'product'} onPress={() => setFilter('product')} />
          <Chip label="Immobilier" active={filter === 'real-estate'} onPress={() => setFilter('real-estate')} />
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {convQuery.isError && !convs ? (
          <View style={{ paddingTop: 40 }}>
            <ErrorStateView onRetry={() => void convQuery.refetch()} />
          </View>
        ) : convQuery.isLoading && !convs ? (
          <View style={{ gap: 14, paddingVertical: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Skeleton height={48} width={48} radius={24} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton height={12} radius={4} />
                  <Skeleton height={10} radius={4} />
                </View>
              </View>
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="msg"
            title={
              search.trim().length > 0
                ? 'Aucun résultat'
                : (convs?.length ?? 0) === 0
                  ? 'Aucune conversation'
                  : 'Aucune conversation dans ce filtre'
            }
            description={
              search.trim().length > 0
                ? 'Essaie un autre mot-clé.'
                : (convs?.length ?? 0) === 0
                  ? 'Contacte un vendeur depuis une annonce pour démarrer une discussion.'
                  : 'Bascule sur Toutes pour voir tes autres discussions.'
            }
          />
        ) : (
          filtered.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/messages/${c.id}`)}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                alignItems: 'center',
              }}
            >
              <Avatar source={c.otherUserAvatarUrl ?? undefined} size="lg" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: c.unread > 0 ? '600' : '500' }} numberOfLines={1}>
                    {c.otherUserDisplayName ?? 'Utilisateur'}
                  </Text>
                  <Text style={{ fontSize: 10, color: c.unread > 0 ? colors.primary : colors.textMuted, fontWeight: c.unread > 0 ? '600' : '400' }}>
                    {c.lastAt ? formatRelativeFR(c.lastAt) : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: c.unread > 0 ? colors.text : colors.textMuted,
                      fontWeight: c.unread > 0 ? '500' : '400',
                    }}
                    numberOfLines={1}
                  >
                    {c.lastMessage ?? ''}
                  </Text>
                  {c.unread > 0 && (
                    <View
                      style={{
                        minWidth: 18,
                        height: 18,
                        paddingHorizontal: 5,
                        borderRadius: 999,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{c.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Phase T.4 — wire what was previously dead UI on this screen :
//   - the 4 filter chips (Toutes/Achats/Ventes/Immobilier) set state that
//     was never applied → now actually filter the conversation list off
//     pinnedListingKind + lastMessageSenderId vs the current user,
//   - the trailing « search » icon button had no onPress → toggles an
//     inline client-side search input that matches against the other
//     user's display name and the last message snippet,
//   - error + loading + empty states + RefreshControl now match the rest
//     of the app.
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { Avatar } from '../primitives/Avatar';
import { Chip } from '../primitives/Chip';
import { TopBar } from '../nav/TopBar';
import { IconButton } from '../primitives/Button';
import { I } from '../../icons/Icon';
import { useConversations } from '../../data/queries';
import { formatRelativeFR } from '../../lib/format';
import { EmptyState, ErrorStateView } from '../feedback/EmptyState';
import { useAuth } from '../../stores/auth';

type Filter = 'all' | 'purchases' | 'sales' | 'real-estate';

export default function MessagesListScreen() {
  const { colors } = useTheme();
  const convQuery = useConversations();
  const convs = convQuery.data;
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  // T.4 — filters applied off conversation shape. "Achats" / "Ventes" are
  // disambiguated by who SENT the last message vs me (last sender being me
  // → I was responding to a seller's prior message means it's typically a
  // purchase ; the heuristic is intentionally loose because conversations
  // don't carry a role yet ; the lastMessageSenderId === meId rule is a
  // pragmatic V1 cut). "Immobilier" filters on pinnedListingKind.
  const filtered = useMemo(() => {
    const base = convs ?? [];
    const trimmed = search.trim().toLowerCase();
    return base.filter((c) => {
      if (filter === 'real-estate' && c.pinnedListingKind !== 'property') return false;
      if (filter === 'purchases') {
        // Conversations about a product where I was the buyer = the pinned
        // listing is a product AND the last sender wasn't me OR I started
        // it. Approximate: pinned kind product AND I'm not always the
        // sender. V1.1 will derive from an orders join.
        if (c.pinnedListingKind !== 'product') return false;
      }
      if (filter === 'sales') {
        if (c.pinnedListingKind !== 'product') return false;
        // Heuristic: last message sender being me OR me being a participant
        // with the property unset and the other user matching a buyer flow ;
        // for V1 we keep it as pinned product + lastMessageSenderId === meId.
        if (c.lastMessageSenderId !== meId) return false;
      }
      if (trimmed.length > 0) {
        const name = (c.otherUserDisplayName ?? '').toLowerCase();
        const last = (c.lastMessage ?? '').toLowerCase();
        if (!name.includes(trimmed) && !last.includes(trimmed)) return false;
      }
      return true;
    });
  }, [convs, filter, search, meId]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title="Messages"
        back
        right={
          <IconButton
            variant="secondary"
            size={36}
            onPress={() => {
              setSearchOpen((o) => {
                if (o) setSearch('');
                return !o;
              });
            }}
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
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
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
          <Chip label="Achats" active={filter === 'purchases'} onPress={() => setFilter('purchases')} />
          <Chip label="Ventes" active={filter === 'sales'} onPress={() => setFilter('sales')} />
          <Chip label="Immobilier" active={filter === 'real-estate'} onPress={() => setFilter('real-estate')} />
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={convQuery.isFetching && !convQuery.isLoading}
            onRefresh={() => void convQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {convQuery.isError ? (
          <View style={{ paddingTop: 40 }}>
            <ErrorStateView onRetry={() => void convQuery.refetch()} />
          </View>
        ) : !convs ? null : filtered.length === 0 ? (
          <EmptyState
            icon="msg"
            title={
              search.trim().length > 0
                ? 'Aucun résultat'
                : convs.length === 0
                  ? 'Aucune conversation'
                  : 'Aucune conversation dans ce filtre'
            }
            description={
              search.trim().length > 0
                ? 'Essaie un autre mot-clé.'
                : convs.length === 0
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

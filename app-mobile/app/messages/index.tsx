import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { IconButton } from '../../src/components/primitives/Button';
import { I } from '../../src/icons/Icon';
import { useConversations } from '../../src/data/queries';
// dev-fixture: conversation list runs off mockUsers for other-user display
// info until a real /v1/messages backend ships. Remove when that lands.
import { getUser } from '../../src/data/mockUsers';
import { formatRelativeFR } from '../../src/lib/format';
import { EmptyState } from '../../src/components/feedback/EmptyState';

type Filter = 'all' | 'purchases' | 'sales' | 'real-estate';

export default function MessagesRoute() {
  const { colors } = useTheme();
  const { data: convs } = useConversations();
  const [filter, setFilter] = useState<Filter>('all');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        title="Messages"
        back
        right={
          <IconButton variant="secondary" size={36}>
            <I.search size={16} color={colors.text} />
          </IconButton>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Toutes" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Achats" active={filter === 'purchases'} onPress={() => setFilter('purchases')} />
          <Chip label="Ventes" active={filter === 'sales'} onPress={() => setFilter('sales')} />
          <Chip label="Immobilier" active={filter === 'real-estate'} onPress={() => setFilter('real-estate')} />
        </ScrollView>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {convs && convs.length === 0 ? (
          <EmptyState icon="msg" title="Aucune conversation" description="Contacte un vendeur depuis une annonce pour démarrer une discussion" />
        ) : (
          convs?.map((c) => {
            const other = getUser(c.otherUserId);
            return (
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
                <Avatar source={other?.photo} size="lg" verified={other?.kycVerified} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: c.unread > 0 ? '600' : '500' }} numberOfLines={1}>
                      {other?.name ?? 'Utilisateur'}
                    </Text>
                    <Text style={{ fontSize: 10, color: c.unread > 0 ? colors.primary : colors.textMuted, fontWeight: c.unread > 0 ? '600' : '400' }}>
                      {formatRelativeFR(c.lastAt)}
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
                      {c.lastMessage}
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
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

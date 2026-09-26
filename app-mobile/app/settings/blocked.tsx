import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { Skeleton } from '../../src/components/primitives/Skeleton';
import { ScreenHeader } from '../../src/components/nav/ScreenHeader';
import { EmptyState, ErrorStateView } from '../../src/components/feedback/EmptyState';
import { useToast } from '../../src/components/feedback/Toast';
import { toToastMessage } from '../../src/lib/api';
import { haptic } from '../../src/lib/haptics';
import { useBlockedUsers, useUnblockUser, type BlockedUser } from '../../src/data/queries';

// Les personnes que l'utilisateur a bloquees, et le seul endroit de l'app ou il
// peut les debloquer. C'est le pendant obligatoire du blocage : la politique
// Google Play demande de pouvoir bloquer quelqu'un, et un blocage sans marche
// arriere serait un piege — on bloque parfois sur un malentendu.
//
// CETTE LISTE NE DIT PAS QUI A BLOQUE L'UTILISATEUR, et l'asymetrie est
// deliberee (voir supabase/functions/list-blocked-users). Le filtre, lui, joue
// dans les deux sens.

export default function BlockedRoute() {
  const { colors, radii } = useTheme();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const query = useBlockedUsers();
  const unblock = useUnblockUser();

  const blocked = query.data ?? [];

  const onPressUnblock = (u: BlockedUser) => {
    const name = u.displayName ?? t('moderation.unknownUser');
    Alert.alert(name, t('moderation.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.unblock'),
        onPress: () => {
          void (async () => {
            haptic.light();
            try {
              await unblock.mutateAsync(u.userId);
              toast.show(t('moderation.unblockDone'), 'success');
            } catch (e) {
              toast.show(toToastMessage(e, t('moderation.unblockError')), 'danger');
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <ScreenHeader
          title={t('moderation.blockedTitle')}
          subtitle={t('moderation.blockedSubtitle')}
        />

        <View style={{ paddingHorizontal: 16 }}>
          {query.isLoading ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={64} radius={radii.lg} />
              <Skeleton height={64} radius={radii.lg} />
            </View>
          ) : query.isError ? (
            <ErrorStateView onRetry={() => void query.refetch()} />
          ) : blocked.length === 0 ? (
            <EmptyState
              icon="shield"
              title={t('moderation.blockedEmpty')}
              description={t('moderation.blockedEmptySub')}
            />
          ) : (
            blocked.map((u) => (
              <View
                key={u.userId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  marginBottom: 10,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Avatar source={u.avatarUrl ?? undefined} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                    {u.displayName ?? t('moderation.unknownUser')}
                  </Text>
                  <Text variant="caption" tone="muted" style={{ letterSpacing: 0 }}>
                    {t('moderation.blockedSince', {
                      date: new Date(u.blockedAt).toLocaleDateString(i18n.language),
                    })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => onPressUnblock(u)}
                  accessibilityRole="button"
                  accessibilityLabel={t('moderation.unblock')}
                  disabled={unblock.isPending}
                  style={({ pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.bgElev : 'transparent',
                    opacity: unblock.isPending ? 0.5 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    {t('moderation.unblock')}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

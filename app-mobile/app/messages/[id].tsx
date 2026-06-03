import { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { IconButton } from '../../src/components/primitives/Button';
import { I } from '../../src/icons/Icon';
import { useConversation, useSendMessage, useMarkConversationRead } from '../../src/data/queries';
import { useAuth } from '../../src/stores/auth';
import { formatGNF } from '../../src/lib/format';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data } = useConversation(id);
  const send = useSendMessage(id);
  const me = useAuth((s) => s.authUserId);
  const markRead = useMarkConversationRead(id);
  const [text, setText] = useState('');

  // Auto-mark-read when arriving on the screen, and whenever the message
  // list changes (new incoming during polling = should clear unread).
  useEffect(() => {
    if (!id || !data?.messages.length) return;
    markRead.mutate();
  }, [id, data?.messages.length]);

  const conv = data?.conversation;
  const otherName = conv?.otherUserDisplayName ?? 'Utilisateur';
  const otherAvatar = conv?.otherUserAvatarUrl;
  const pinned = conv?.pinnedListingId && conv.pinnedListingTitle
    ? {
        id: conv.pinnedListingId,
        title: conv.pinnedListingTitle,
        photoUrl: conv.pinnedListingPhotoUrl,
        priceGnf: conv.pinnedListingPriceGnf ?? 0,
        kind: conv.pinnedListingKind,
      }
    : null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton variant="ghost" size={32} onPress={() => router.back()}>
          <I.arrowLeft size={18} color={colors.text} />
        </IconButton>
        <Avatar source={otherAvatar ?? undefined} size="md" online />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>{otherName}</Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            En ligne · répond en ~2h
          </Text>
        </View>
        <IconButton variant="ghost" size={32}>
          <I.moreV size={18} color={colors.textMuted} />
        </IconButton>
      </View>

      {pinned && (
        <Pressable
          onPress={() => router.push(`/${pinned.kind === 'property' ? 'property' : 'product'}/${pinned.id}`)}
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 8,
            backgroundColor: colors.bgElev,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Image source={pinned.photoUrl ?? undefined} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.bgSunken }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              À propos de
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
              {pinned.title}
            </Text>
          </View>
          <Text style={{ fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] }}>
            {formatGNF(pinned.priceGnf)}
          </Text>
        </Pressable>
      )}

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="micro" tone="faint" center style={{ marginVertical: 8 }}>
          Aujourd'hui
        </Text>
        {data?.messages.map((m) => {
          const isMine = m.senderId === me;
          return (
            <View key={m.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 14,
                  borderBottomRightRadius: isMine ? 4 : 14,
                  borderBottomLeftRadius: isMine ? 14 : 4,
                  backgroundColor: isMine ? colors.primarySoft : colors.card,
                  borderWidth: isMine ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 13, color: isMine ? colors.primaryDeep : colors.text }}>{m.body}</Text>
              </View>
              <Text
                variant="micro"
                tone="muted"
                style={{
                  marginTop: 3,
                  textAlign: isMine ? 'right' : 'left',
                  paddingHorizontal: 4,
                  letterSpacing: 0,
                  textTransform: 'none',
                }}
              >
                {new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {isMine && m.seen ? ' · Vu' : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'center',
          backgroundColor: colors.card,
        }}
      >
        <IconButton variant="ghost" size={36}>
          <I.paperclip size={18} color={colors.textMuted} />
        </IconButton>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Écris un message"
          placeholderTextColor={colors.textFaint}
          style={{
            flex: 1,
            height: 40,
            paddingHorizontal: 14,
            backgroundColor: colors.bgElev,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            color: colors.text,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={() => {
            if (!text.trim()) return;
            send.mutate(text.trim());
            setText('');
          }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Envoyer"
        >
          <I.send size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

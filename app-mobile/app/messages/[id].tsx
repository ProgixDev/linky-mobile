import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Avatar } from '../../src/components/primitives/Avatar';
import { IconButton } from '../../src/components/primitives/Button';
import { I } from '../../src/icons/Icon';
import { useConversation, useSendMessage, useMarkConversationRead } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { useAuth } from '../../src/stores/auth';
import { formatGNF } from '../../src/lib/format';

const MESSAGE_MAX_LENGTH = 2000;

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data, isLoading, isError, refetch } = useConversation(id);
  const send = useSendMessage(id);
  const me = useAuth((s) => s.authUserId);
  const markRead = useMarkConversationRead(id);
  const toast = useToast();
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const messageCount = data?.messages.length ?? 0;

  // Auto-scroll to the newest message when the thread grows (send or incoming).
  useEffect(() => {
    if (messageCount > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messageCount]);

  const onSend = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    // Keep the draft until the server confirms; on a flaky 3G send the user
    // must not silently lose what they typed.
    send.mutate(body, {
      onSuccess: () => setText(''),
      onError: () => {
        setText(body);
        toast.show('Message non envoyé — réessaie.', 'danger');
      },
    });
  };

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
      {/* Phase X.2 — header cleanup. The static "En ligne · répond en ~2h"
          subtitle was a lie (recipient not necessarily online, response time
          invented). Replaced with the pinned listing title when present
          (honest context : what the chat is about) ; else no subtitle.
          The trailing moreV kebab had no onPress — V1 has no
          per-conversation menu — so it was dead UI ; removed. The Avatar's
          `online` presence dot is gone for the same reason. */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton variant="ghost" size={32} onPress={() => router.back()}>
          <I.arrowLeft size={18} color={colors.text} />
        </IconButton>
        <Avatar source={otherAvatar ?? undefined} size="md" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
            {otherName}
          </Text>
          {pinned ? (
            <Text
              variant="micro"
              tone="muted"
              style={{ letterSpacing: 0, textTransform: 'none' }}
              numberOfLines={1}
            >
              {pinned.title}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
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

      {/* Phase X.2 — hardcoded "Aujourd'hui" separator dropped. The text
          didn't reflect the actual messages' dates — a minor visual lie
          when a conversation spanned days. V1 chat volumes don't justify
          a real per-day group header. */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError && messageCount === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Text tone="muted" style={{ textAlign: 'center' }}>
            Impossible de charger la conversation.
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={{
              paddingHorizontal: 18,
              height: 40,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Réessayer</Text>
          </Pressable>
        </View>
      ) : messageCount === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text tone="muted" style={{ textAlign: 'center' }}>
            Aucun message pour l&apos;instant. Écris le premier.
          </Text>
        </View>
      ) : (
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 8 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
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
      )}

      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          flexDirection: 'row',
          gap: 8,
          alignItems: 'flex-end',
          backgroundColor: colors.card,
        }}
      >
        {/* Phase X.2 — paperclip attachment button had no onPress.
            V1 has no message attachments — removed rather than leave dead UI. */}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Écris un message"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={onSend}
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 120,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            backgroundColor: colors.bgElev,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            color: colors.text,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={onSend}
          disabled={!text.trim() || send.isPending}
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !text.trim() || send.isPending ? 0.5 : 1,
          }}
          accessibilityLabel="Envoyer"
        >
          {send.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <I.send size={16} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

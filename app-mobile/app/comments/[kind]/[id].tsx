// Full comments thread for a product/property listing: scrollable list + a
// keyboard-safe composer with a Telegram-style send button, comment likes and
// one-level replies. Public read; posting/liking requires auth.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, router } from 'expo-router';
import { Send, X } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { IconButton } from '../../../src/components/primitives/Button';
import { I } from '../../../src/icons/Icon';
import { CommentRow } from '../../../src/components/comments/CommentRow';
import {
  useListingComments,
  useAddComment,
  type CommentKind,
} from '../../../src/data/queries';
import { useAuth } from '../../../src/stores/auth';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { haptic } from '../../../src/lib/haptics';
import type { Comment } from '../../../src/data/types';

const MAX_LENGTH = 1000;

export default function CommentsRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { colors } = useTheme();
  const listingKind: CommentKind = kind === 'product' ? 'product' : 'property';
  const q = useListingComments(listingKind, id);
  const add = useAddComment();
  const me = useAuth((s) => s.authUserId);
  const toast = useToast();
  const [text, setText] = useState('');
  // When set, the composer posts a reply to this comment.
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const comments = q.data ?? [];

  const onSend = () => {
    const body = text.trim();
    if (!body || add.isPending) return;
    haptic.light();
    add.mutate(
      { kind: listingKind, listingId: id, body, parentId: replyingTo?.id },
      {
        onSuccess: () => {
          setText('');
          setReplyingTo(null);
        },
        onError: (e) => {
          setText(body);
          toast.show(toToastMessage(e, "Impossible d'envoyer le commentaire."), 'danger');
        },
      },
    );
  };

  const canSend = !!text.trim() && !add.isPending;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <IconButton variant="ghost" size={32} onPress={() => router.back()}>
          <I.arrowLeft size={18} color={colors.text} />
        </IconButton>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Commentaires</Text>
      </View>

      {/* keyboard-controller's KAV handles Expo edge-to-edge correctly (the
          plain RN KeyboardAvoidingView left the composer under the keyboard on
          Android). */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {q.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : comments.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text tone="muted" style={{ textAlign: 'center', letterSpacing: 0 }}>
              Aucun commentaire pour le moment. Sois le premier à commenter !
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 18 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                kind={listingKind}
                listingId={id}
                canInteract={!!me}
                onReply={setReplyingTo}
              />
            ))}
          </ScrollView>
        )}

        {me ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
            {/* Reply context banner */}
            {replyingTo && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingTop: 8,
                }}
              >
                <View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: colors.primary }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                    En réponse à {replyingTo.authorName ?? 'Utilisateur Linky'}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.textMuted, letterSpacing: 0 }}>
                    {replyingTo.body}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyingTo(null)} hitSlop={8} accessibilityLabel="Annuler la réponse">
                  <X size={16} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              </View>
            )}

            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={replyingTo ? 'Écris ta réponse…' : 'Ajoute un commentaire…'}
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={MAX_LENGTH}
                style={{
                  flex: 1,
                  minHeight: 42,
                  maxHeight: 120,
                  paddingHorizontal: 14,
                  paddingTop: 11,
                  paddingBottom: 11,
                  backgroundColor: colors.bgElev,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 22,
                  color: colors.text,
                  fontSize: 14,
                }}
              />
              {/* Telegram-style circular green send button. */}
              <Pressable
                onPress={onSend}
                disabled={!canSend}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  backgroundColor: canSend ? colors.primary : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                accessibilityLabel="Envoyer"
              >
                {add.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Send
                    size={19}
                    color={canSend ? '#FFFFFF' : colors.textFaint}
                    strokeWidth={2}
                    // Telegram tilts the paper plane slightly; nudge it so it
                    // reads centered in the circle.
                    style={{ marginLeft: -2, transform: [{ rotate: '8deg' }] }}
                  />
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text tone="muted" center style={{ letterSpacing: 0 }}>
              Connecte-toi pour commenter.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

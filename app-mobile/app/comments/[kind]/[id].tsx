// Full comments thread for a product/property listing: scrollable list + a
// keyboard-safe composer. Mirrors the chat screen (app/messages/[id].tsx).
// Public read; posting requires auth.
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { IconButton } from '../../../src/components/primitives/Button';
import { I } from '../../../src/icons/Icon';
import { CommentRow } from '../../../src/components/comments/CommentRow';
import { useListingComments, useAddComment, type CommentKind } from '../../../src/data/queries';
import { useAuth } from '../../../src/stores/auth';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { haptic } from '../../../src/lib/haptics';

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

  const comments = q.data ?? [];

  const onSend = () => {
    const body = text.trim();
    if (!body || add.isPending) return;
    haptic.light();
    add.mutate(
      { kind: listingKind, listingId: id, body },
      {
        onSuccess: () => setText(''),
        onError: (e) => {
          setText(body);
          toast.show(toToastMessage(e, "Impossible d'envoyer le commentaire."), 'danger');
        },
      },
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
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
            contentContainerStyle={{ padding: 16, gap: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {comments.map((c) => (
              <CommentRow key={c.id} comment={c} />
            ))}
          </ScrollView>
        )}

        {me ? (
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
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ajoute un commentaire…"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={MAX_LENGTH}
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
              disabled={!text.trim() || add.isPending}
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !text.trim() || add.isPending ? 0.5 : 1,
              }}
              accessibilityLabel="Envoyer le commentaire"
            >
              {add.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <I.send size={16} color="#FFFFFF" />}
            </Pressable>
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

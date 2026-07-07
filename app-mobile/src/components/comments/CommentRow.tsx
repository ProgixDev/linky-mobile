import { Pressable, View } from 'react-native';
import { Avatar } from '../primitives/Avatar';
import { Text } from '../primitives/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { I } from '../../icons/Icon';
import { formatRelativeFR } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useToggleCommentLike, type CommentKind } from '../../data/queries/comments';
import type { Comment } from '../../data/types';

export function CommentRow({
  comment,
  kind,
  listingId,
  canInteract,
  onReply,
  isReply = false,
}: {
  comment: Comment;
  kind: CommentKind;
  listingId: string;
  /** false when logged out — hide like/reply actions. */
  canInteract: boolean;
  onReply?: (c: Comment) => void;
  isReply?: boolean;
}) {
  const { colors } = useTheme();
  const toggleLike = useToggleCommentLike();

  const onLike = () => {
    if (!canInteract || toggleLike.isPending) return;
    haptic.light();
    toggleLike.mutate({ kind, listingId, commentId: comment.id });
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Avatar source={comment.authorAvatarUrl ?? undefined} size={isReply ? 'xs' : 'sm'} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
            {comment.authorName ?? 'Utilisateur Linky'}
          </Text>
          <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
            {formatRelativeFR(comment.createdAt)}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20, letterSpacing: 0 }}>
          {comment.body}
        </Text>

        {/* Actions: like (with count) + reply (top-level only) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 1 }}>
          <Pressable
            onPress={onLike}
            disabled={!canInteract}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            accessibilityLabel={comment.likedByMe ? 'Retirer le like' : 'Aimer'}
          >
            {comment.likedByMe ? (
              <I.heartFill size={14} color={colors.danger} />
            ) : (
              <I.heart size={14} color={colors.textMuted} />
            )}
            {comment.likeCount > 0 && (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: comment.likedByMe ? colors.danger : colors.textMuted,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {comment.likeCount}
              </Text>
            )}
          </Pressable>

          {!isReply && canInteract && onReply && (
            <Pressable
              onPress={() => { haptic.light(); onReply(comment); }}
              hitSlop={8}
              accessibilityLabel="Répondre"
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>
                Répondre
              </Text>
            </Pressable>
          )}
        </View>

        {/* Replies — nested, oldest-first, no further nesting. */}
        {!isReply && comment.replies && comment.replies.length > 0 && (
          <View style={{ gap: 14, marginTop: 12, paddingLeft: 4, borderLeftWidth: 2, borderLeftColor: colors.border }}>
            {comment.replies.map((r) => (
              <View key={r.id} style={{ paddingLeft: 8 }}>
                <CommentRow
                  comment={r}
                  kind={kind}
                  listingId={listingId}
                  canInteract={canInteract}
                  isReply
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

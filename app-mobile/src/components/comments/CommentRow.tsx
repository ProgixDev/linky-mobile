import { useTranslation } from 'react-i18next';
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
  onModerate,
  currentUserId,
  isReply = false,
}: {
  comment: Comment;
  kind: CommentKind;
  listingId: string;
  /** false when logged out — hide like/reply actions. */
  canInteract: boolean;
  onReply?: (c: Comment) => void;
  /** Ouvre le menu « Signaler / Bloquer ». Absent = pas de moderation ici
   *  (l'apercu read-only sur la fiche d'annonce, par exemple). */
  onModerate?: (c: Comment) => void;
  /** Sert a NE PAS proposer de se signaler ni de se bloquer soi-meme. */
  currentUserId?: string | null;
  isReply?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
            accessibilityLabel={comment.likedByMe ? t('a11y.unlike') : t('a11y.like')}
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
              accessibilityLabel={t('messages.reply')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>
                {t('messages.reply')}
              </Text>
            </Pressable>
          )}

          {/* SIGNALER / BLOQUER — exige par la politique Google Play sur le
              contenu genere par les utilisateurs. Cache sur SON PROPRE
              commentaire : se signaler soi-meme n'a pas de sens, et le serveur
              refuse l'auto-blocage de toute facon. Le geste est discret (une
              icone, pas un libelle) parce qu'il concerne une minorite de cas et
              que le mettre en avant sous chaque message donnerait au fil un air
              de champ de mines. */}
          {onModerate && comment.authorId !== currentUserId && (
            <Pressable
              onPress={() => { haptic.light(); onModerate(comment); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('moderation.reportOrBlock')}
              style={{ marginLeft: 'auto' }}
            >
              <I.more size={16} color={colors.textFaint} />
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
                  onModerate={onModerate}
                  currentUserId={currentUserId}
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

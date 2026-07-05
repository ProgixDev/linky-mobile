import { View } from 'react-native';
import { Avatar } from '../primitives/Avatar';
import { Text } from '../primitives/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { formatRelativeFR } from '../../lib/format';
import type { Comment } from '../../data/types';

export function CommentRow({ comment }: { comment: Comment }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Avatar source={comment.authorAvatarUrl ?? undefined} size="sm" />
      <View style={{ flex: 1, gap: 2 }}>
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
      </View>
    </View>
  );
}

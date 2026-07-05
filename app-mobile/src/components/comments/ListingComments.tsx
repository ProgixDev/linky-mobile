// Compact comments block for a listing detail screen: shows the 2 most recent
// comments + a button that opens the full thread (with composer). The thread
// screen (app/comments/[kind]/[id].tsx) owns posting + keyboard handling.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { CommentRow } from './CommentRow';
import { useListingComments, type CommentKind } from '../../data/queries';

export function ListingComments({ kind, id }: { kind: CommentKind; id: string }) {
  const { colors } = useTheme();
  const { data: comments } = useListingComments(kind, id);
  const count = comments?.length ?? 0;
  return (
    <View style={{ gap: 12 }}>
      {count > 0 &&
        comments!.slice(0, 2).map((c) => <CommentRow key={c.id} comment={c} />)}
      <Pressable
        onPress={() => router.push(`/comments/${kind}/${id}` as never)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: 44,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <MessageCircle size={16} color={colors.text} strokeWidth={2} />
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>
          {count > 0 ? `Voir les ${count} commentaire${count > 1 ? 's' : ''}` : 'Ajouter un commentaire'}
        </Text>
      </Pressable>
    </View>
  );
}

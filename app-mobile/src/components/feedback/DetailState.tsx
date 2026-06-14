import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { TopBar } from '../nav/TopBar';
import { ErrorStateView } from './EmptyState';

// Shared loading / error fallback for detail screens (product, property, shop,
// order, visit). Before this, those screens returned a blank `View` on a slow
// or failed fetch — on 3G that read as a frozen white screen with no way to
// recover. Now: a back bar + spinner while loading, and an honest retry on error.
export function DetailStateScreen({
  loading,
  title,
  onRetry,
}: {
  loading: boolean;
  title?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={title ?? ''} back />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ErrorStateView onRetry={onRetry} />
      )}
    </SafeAreaView>
  );
}

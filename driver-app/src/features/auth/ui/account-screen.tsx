import { Alert, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/shared/ui';

import { useAuthStore } from '../model/store';

/**
 * Account screen — shows the signed-in livreur, a sign-out, and the required
 * in-app **account deletion** path (Apple 5.1.1(v) / Google Play). The deletion
 * mechanism is what matters for store compliance; the design pass refines the look.
 */
export function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const isLivreur = user?.roles?.includes('livreur') ?? false;

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteAccount();
          },
        },
      ],
    );
  };

  return (
    <Screen testID="account-screen">
      <View className="flex-1 gap-4 pt-4">
        <AppText variant="display">Account</AppText>

        <Card className="gap-1" testID="account-user">
          <AppText variant="label" testID="account-name">
            {user?.display_name?.trim() || 'Livreur'}
          </AppText>
          <AppText variant="caption" className="text-ink-muted" testID="account-role">
            {isLivreur ? 'Driver account' : 'Account'}
          </AppText>
        </Card>

        <View className="flex-1 justify-end gap-3 pb-6">
          <Button
            testID="account-sign-out"
            variant="secondary"
            label="Sign out"
            onPress={() => void signOut()}
          />
          <Button
            testID="account-delete"
            variant="destructive"
            label="Delete account"
            onPress={confirmDelete}
          />
          <AppText variant="caption" className="text-center text-ink-muted">
            Deleting your account removes all your data permanently.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

import { Alert, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/shared/ui';

import { useAuthStore } from '../model/store';

/**
 * Account screen — shows the signed-in livreur, a sign-out, and the required
 * in-app **account deletion** path (Apple 5.1.1(v) / Google Play). The deletion
 * mechanism is what matters for store compliance; the design pass refines the look.
 * Copy is French tu-form like the rest of the app.
 */
export function AccountScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const error = useAuthStore((s) => s.error);

  const isLivreur = user?.roles?.includes('livreur') ?? false;

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer le compte ?',
      'Ton compte sera désactivé immédiatement et tes données personnelles supprimées. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
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
        <AppText variant="display">Mon compte</AppText>

        <Card className="gap-1" testID="account-user">
          <AppText variant="label" testID="account-name">
            {user?.display_name?.trim() || 'Livreur'}
          </AppText>
          <AppText variant="caption" className="text-ink-muted" testID="account-role">
            {isLivreur ? 'Compte livreur' : 'Compte'}
          </AppText>
        </Card>

        <View className="flex-1 justify-end gap-3 pb-6">
          {/* Surfaces the store error (e.g. « livraison en cours ») — the old
              screen swallowed it and Delete looked like it did nothing. */}
          {error ? (
            <AppText
              variant="caption"
              className="text-center text-danger"
              testID="account-error"
            >
              {error}
            </AppText>
          ) : null}
          <Button
            testID="account-sign-out"
            variant="secondary"
            label="Se déconnecter"
            onPress={() => void signOut()}
          />
          <Button
            testID="account-delete"
            variant="destructive"
            label="Supprimer mon compte"
            onPress={confirmDelete}
          />
          <AppText variant="caption" className="text-center text-ink-muted">
            La suppression retire définitivement tes données personnelles.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

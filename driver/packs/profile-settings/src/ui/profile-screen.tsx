import { View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useProfile } from '../use-profile';

/** DESIGN: replace after the Claude Design pass. Functional placeholder profile. */
export function ProfileScreen({ onEdit }: { onEdit?: () => void }) {
  const { profile, loading } = useProfile();
  return (
    <Screen>
      <View className="flex-1 gap-3 pt-6">
        {loading ? <AppText variant="caption">Loading…</AppText> : null}
        <AppText variant="display">{profile?.display_name ?? 'Your name'}</AppText>
        {profile?.bio ? <AppText variant="body">{profile.bio}</AppText> : null}
        {onEdit ? <Button testID="profile-edit" label="Edit profile" onPress={onEdit} /> : null}
      </View>
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/shared/ui';

import { useProfile } from '../use-profile';

/** DESIGN: replace after the Claude Design pass. Functional placeholder editor. */
export function EditProfileScreen({ onSaved }: { onSaved?: () => void }) {
  const { profile, save, error } = useProfile();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  const submit = async () => {
    setBusy(true);
    const ok = await save({ display_name: name || undefined, bio: bio || undefined });
    setBusy(false);
    if (ok) onSaved?.();
  };

  return (
    <Screen>
      <View className="flex-1 gap-4 pt-6">
        <AppText variant="title">Edit profile</AppText>
        <TextField
          testID="edit-name"
          className="flex-none"
          value={name}
          onChangeText={setName}
          placeholder="Display name"
        />
        <TextField
          testID="edit-bio"
          className="h-24 flex-none"
          value={bio}
          onChangeText={setBio}
          placeholder="Bio"
          multiline
        />
        {error ? (
          <AppText variant="caption" className="text-danger">
            {error}
          </AppText>
        ) : null}
        <Button testID="edit-save" label="Save" loading={busy} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}

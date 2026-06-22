import { Switch, View } from 'react-native';

import { AppText, Screen } from '@/shared/ui';

import { useSettingsStore } from '../settings-store';

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-ink-faint/10 py-3">
      <AppText variant="body">{label}</AppText>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

/** DESIGN: replace after the Claude Design pass. Functional placeholder settings. */
export function SettingsScreen() {
  const s = useSettingsStore();
  return (
    <Screen>
      <View className="flex-1 pt-6">
        <AppText variant="title" className="mb-2">
          Settings
        </AppText>
        <Row
          label="Push notifications"
          value={s.pushNotifications}
          onChange={(v) => s.set('pushNotifications', v)}
        />
        <Row
          label="Email notifications"
          value={s.emailNotifications}
          onChange={(v) => s.set('emailNotifications', v)}
        />
        <Row
          label="Reduce motion"
          value={s.reduceMotion}
          onChange={(v) => s.set('reduceMotion', v)}
        />
      </View>
    </Screen>
  );
}

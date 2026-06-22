import { Link, Stack } from 'expo-router';

import { AppText, Screen } from '@/shared/ui';

export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen testID="not-found-screen" className="items-center justify-center gap-4">
        <AppText variant="title">This screen does not exist.</AppText>
        <Link href="/" className="font-sans-semibold text-brand-600">
          Go to the home screen
        </Link>
      </Screen>
    </>
  );
}

import { Button } from '@/shared/ui';

import { useFollow } from '../use-follow';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder follow
 * button with optimistic state.
 */
export function FollowButton({ userId }: { userId: string }) {
  const { following, busy, toggle } = useFollow(userId);
  return (
    <Button
      testID="follow-button"
      label={following ? 'Following' : 'Follow'}
      variant={following ? 'secondary' : 'primary'}
      loading={busy}
      onPress={() => void toggle()}
    />
  );
}

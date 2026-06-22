import { useCallback, useEffect, useState } from 'react';

import { getMyProfile, updateProfile } from './data/profile-repo';
import { type Profile, type ProfileUpdate } from './model/profile';

/** Load + edit the current user's profile. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await getMyProfile();
    if (r.ok) setProfile(r.value);
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (update: ProfileUpdate): Promise<boolean> => {
    const r = await updateProfile(update);
    if (r.ok) {
      setProfile(r.value);
      return true;
    }
    setError(r.error);
    return false;
  }, []);

  return { profile, loading, error, save, refresh };
}

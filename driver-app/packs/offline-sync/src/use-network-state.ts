import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Live connectivity. `isOnline` is true only when connected AND the internet is
 * actually reachable (NetInfo distinguishes "connected to wifi" from "wifi has
 * no internet"). Use it to show an offline banner or gate live calls.
 */
export function useNetworkState() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, []);

  return { isOnline };
}

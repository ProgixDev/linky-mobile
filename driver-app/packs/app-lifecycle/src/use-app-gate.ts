import * as Application from 'expo-application';
import { useEffect, useState } from 'react';

import { fetchAppConfig } from './data/app-config';
import { type AppConfig, type GateStatus } from './model/config';

function currentBuild(): number {
  // nativeBuildVersion is the integer build (iOS CFBundleVersion / Android versionCode).
  const raw = Application.nativeBuildVersion ?? '1';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Evaluates the remote config against this build. `status`:
 *  - 'maintenance'      → app is down for maintenance (hard block)
 *  - 'update-required'  → build older than min supported (hard block)
 *  - 'update-available' → a newer build exists (soft nudge)
 *  - 'ok'               → proceed
 * Fails open to 'ok' if config can't load, so a backend hiccup never bricks the app.
 */
export function useAppGate() {
  const [status, setStatus] = useState<GateStatus>('ok');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const cfg = await fetchAppConfig();
      setConfig(cfg);
      if (cfg) {
        const build = currentBuild();
        if (cfg.maintenance) setStatus('maintenance');
        else if (build < cfg.min_supported_build) setStatus('update-required');
        else if (build < cfg.latest_build) setStatus('update-available');
        else setStatus('ok');
      }
      setLoading(false);
    })();
  }, []);

  return { status, config, loading };
}

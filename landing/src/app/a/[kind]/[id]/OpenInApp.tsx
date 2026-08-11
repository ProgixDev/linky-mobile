'use client';

import { useEffect, useState } from 'react';

/**
 * Tries the app first, falls back to the store.
 *
 * On mobile we attempt the `linky://` deep link on mount. If the app IS
 * installed the OS switches to it and this page is backgrounded — the
 * visibility check below then cancels the store redirect. If nothing handles
 * the scheme the page simply stays visible and we send the visitor to the
 * store, which is the "install the app first" behaviour the client asked for.
 *
 * Both actions stay available as explicit buttons, because a silent auto-jump
 * is hostile on desktop and unreliable on in-app browsers (WhatsApp, Facebook).
 */
export function OpenInApp({ deepLink, storeUrl }: { deepLink: string; storeUrl: string }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsMobile(mobile);
    if (!mobile) return;

    let cancelled = false;
    // If we're still here after the attempt, the app isn't installed.
    const timer = window.setTimeout(() => {
      if (!cancelled && document.visibilityState === 'visible') {
        window.location.href = storeUrl;
      }
    }, 1500);
    const onHide = () => {
      // App took over → don't yank the user to the store when they come back.
      cancelled = true;
      window.clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', onHide);

    window.location.href = deepLink;

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [deepLink, storeUrl]);

  return (
    <div className="mt-5 flex flex-col gap-3">
      <a
        href={deepLink}
        className="flex h-14 w-full items-center justify-center rounded-2xl bg-black text-base font-bold text-white"
      >
        Ouvrir dans l&apos;application
      </a>
      <a
        href={storeUrl}
        className="flex h-14 w-full items-center justify-center rounded-2xl border border-black/15 text-base font-bold"
      >
        Télécharger Linky
      </a>
      {!isMobile ? (
        <p className="text-center text-xs text-black/45">
          Ouvre ce lien depuis ton téléphone pour voir l&apos;annonce dans l&apos;application.
        </p>
      ) : null}
    </div>
  );
}

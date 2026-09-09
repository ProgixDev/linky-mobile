// Android APK download. `/linky.apk` (vercel.json) 302-redirects to
// https://github.com/ProgixDev/linky-downloads/releases/latest/download/linky.apk
// — stable and non-expiring, unlike the EAS artifact URL used briefly before
// it (that one dies 30 days after each build; see DOWNLOAD_HOSTING.md for the
// full history, including why Vercel Blob was abandoned first).
//
// To ship a NEW build:
//   1. eas build --platform android --profile preview
//   2. gh release create vX.Y.Z <path-to.apk>#linky.apk --repo ProgixDev/linky-downloads \
//        --title "Linky X.Y.Z (Android) — <short highlight>" --notes "<release notes>"
// No code edit or redeploy needed here — "latest" resolves automatically.
export const ANDROID_APK_PATH = '/linky.apk';

// Companion driver app — served the same way (Blob + vercel.json rewrite/headers).
export const DRIVER_APK_PATH = '/linky-driver.apk';

// Shown next to the download CTA so users know what they're getting.
export const ANDROID_APK_LABEL = 'Android · APK';

// ---------------------------------------------------------------------------
// LA VERSION AFFICHÉE SOUS LE BOUTON.
//
// Elle est LUE sur la release GitHub, jamais écrite en dur ici. Un numéro codé
// dans la page serait une seconde source de vérité : au premier build publié
// sans penser à l'éditer, la page annoncerait une version que le fichier
// téléchargé ne porte pas — et personne ne s'en apercevrait, puisque le bouton,
// lui, continuerait de servir la bonne.
//
// Mise en cache une heure : la page ne dépend pas de la disponibilité de
// l'API GitHub à chaque visite, et une release publiée est visible dans l'heure.
//
// ÉCHOUE EN SILENCE, VOLONTAIREMENT. Si l'API ne répond pas ou limite le débit,
// on rend `null` et la ligne disparaît. Le bouton de téléchargement, lui, ne
// dépend de rien de tout cela : il pointe sur /linky.apk, qui redirige vers
// `releases/latest`. Mieux vaut une page sans numéro de version qu'une page
// cassée — ou pire, un numéro faux.
export interface AndroidRelease {
  /** « 1.0.4 », sans le v du tag. */
  version: string;
  /** Date de publication déjà formatée en français, calculée SERVEUR pour que
   *  le rendu client ne diverge pas selon le fuseau du visiteur. */
  publishedLabel: string;
}

export async function getLatestAndroidRelease(): Promise<AndroidRelease | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/ProgixDev/linky-downloads/releases/latest',
      { headers: { Accept: 'application/vnd.github+json' }, next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const rec = json as { tag_name?: unknown; published_at?: unknown };
    if (typeof rec.tag_name !== 'string') return null;
    const version = rec.tag_name.replace(/^v/i, '');
    if (!version) return null;

    let publishedLabel = '';
    if (typeof rec.published_at === 'string') {
      const d = new Date(rec.published_at);
      if (!Number.isNaN(d.getTime())) {
        publishedLabel = new Intl.DateTimeFormat('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(d);
      }
    }
    return { version, publishedLabel };
  } catch {
    return null;
  }
}

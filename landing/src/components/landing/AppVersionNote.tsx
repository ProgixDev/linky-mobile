import type { AndroidRelease } from '@/lib/download';

/**
 * La ligne « Version 1.0.4 · 9 septembre 2026 », sous le bouton de
 * téléchargement.
 *
 * POURQUOI ELLE EXISTE. Le bouton sert toujours la dernière version — il pointe
 * sur /linky.apk, qui redirige vers `releases/latest`. Mais rien ne le DISAIT :
 * quelqu'un qui vient de télécharger n'avait aucun moyen de savoir s'il tenait
 * la dernière, ni de vérifier qu'une mise à jour annoncée était bien en ligne.
 *
 * UN SEUL EXEMPLAIRE, pour l'accroche et pour la bande d'appel en bas de page.
 * Les deux endroits affichent le même bouton ; leur faire afficher deux
 * versions formatées séparément serait la première marche vers la divergence.
 *
 * Rend `null` quand la version n'a pas pu être lue — voir getLatestAndroidRelease.
 */
export function AppVersionNote({
  release,
  tone = 'dark',
}: {
  release: AndroidRelease | null;
  /** 'dark' : texte sombre sur fond clair. 'light' : l'inverse. */
  tone?: 'dark' | 'light';
}) {
  if (!release) return null;
  const cls = tone === 'light' ? 'text-white/60' : 'text-[#1E2825]/45';
  return (
    <p className={['text-[11px] font-medium tracking-wide', cls].join(' ')}>
      Version {release.version}
      {release.publishedLabel ? ` · ${release.publishedLabel}` : ''}
    </p>
  );
}

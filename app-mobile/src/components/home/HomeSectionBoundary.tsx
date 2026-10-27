import { Component, type ReactNode } from 'react';

/**
 * UN FILET SOUS CHAQUE SECTION AJOUTÉE À L'ACCUEIL.
 *
 * Le 2026-10-26, la première version du carrousel a fait passer l'application
 * à un ÉCRAN GRIS juste après l'affichage de l'accueil, en production. C'est
 * la signature d'une erreur levée pendant un rendu : sans limite d'erreur,
 * React démonte TOUT l'arbre, et il ne reste que la couleur de fond.
 *
 * Une section décorative ne doit jamais pouvoir éteindre la première page.
 * En cas d'erreur, elle disparaît et le reste de l'accueil continue.
 *
 * Ce filet ne rattrape QUE les erreurs de rendu. Un plantage natif (lecteur
 * vidéo, module réseau) tue l'application quoi qu'on fasse côté JavaScript —
 * d'où les interrupteurs de src/lib/flags.ts, coupés tant qu'un test sur
 * téléphone ne les a pas validés.
 */
export class HomeSectionBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[home] la section « ${this.props.name} » a levé une erreur et a été masquée`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

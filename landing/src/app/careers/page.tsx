// Aucun poste n'est ouvert, et la page n'en invente plus.
//
// Jusqu'au 2026-09-07 elle listait cinq offres — Senior React Native Engineer,
// Backend Engineer, Designer Produit, Trust & Safety Operations Lead, Account
// Manager Diaspora — avec equipe et ville pour chacune. Aucune n'existait.
//
// Ce n'est pas une exageration marketing sans consequence : une offre d'emploi
// fictive fait postuler de vraies personnes, qui preparent une candidature et
// attendent une reponse pour un poste qui n'a jamais ete ouvert.
//
// La page est conservee (le pied de page y renvoie) et dit desormais ce qui est
// vrai : rien d'ouvert aujourd'hui, mais une adresse qui repond.
import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Carrières',
  description: 'Rejoindre Linky — aucun poste ouvert pour le moment.',
};

export default function CareersPage() {
  return (
    <PageShell
      eyebrow="Carrières"
      title="Aucun poste ouvert pour le moment."
      subtitle="Linky est une petite équipe et le service n'a pas encore ouvert. Nous ne recrutons pas aujourd'hui."
    >
      <p className="text-sm leading-relaxed opacity-80">
        Si tu penses avoir quelque chose à apporter — construire pour la Guinée,
        sur des connexions lentes, avec de l&apos;argent réel en jeu — écris-nous
        quand même. On lit tout, même sans poste ouvert, et on garde les profils
        qui nous marquent.
      </p>
      <p className="mt-4 text-sm leading-relaxed opacity-80">
        <a href="mailto:contact@linkygroup.com" className="underline">
          contact@linkygroup.com
        </a>
      </p>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { PageShell, Prose } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    'Linky est une startup guinéenne qui réunit marketplace et immobilier dans une seule app, pour un marché plus sûr et plus accessible.',
};

const VALUES = [
  {
    n: '01',
    t: 'Local d\'abord',
    d: 'Conçu à Conakry, par et pour des Guinéens. Mobile Money est une fonctionnalité de premier rang, pas un add-on.',
  },
  {
    n: '02',
    t: 'Confiance par défaut',
    d: 'Vérification d\'identité disponible, escrow sur chaque transaction, médiation humaine en cas de litige. La sécurité n\'est pas un upsell.',
  },
  {
    n: '03',
    t: 'Diaspora bienvenue',
    d: 'Paiement par carte ou Mobile Money guinéen depuis l\'étranger, livraison vers le pays, visites organisées pour l\'immobilier. Conakry à portée de main depuis Paris.',
  },
  {
    n: '04',
    t: 'Vitesse honnête',
    d: 'On expédie vite, mais on dit ce qui n\'est pas prêt. Pas de promesses de feuille de route en l\'air.',
  },
];

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="L'équipe"
      title="On construit Linky en Guinée, pour la Guinée."
      subtitle="Notre obsession : rendre le commerce et l'immobilier guinéens plus simples, plus sûrs, plus fluides."
    >
      <Prose>
        <p>
          Linky est née d&apos;une frustration partagée : trop d&apos;annonces
          dispersées sur WhatsApp, Facebook et Jumia, trop d&apos;arnaques, pas
          assez de moyens de paiement sécurisés.
        </p>
        <p>
          Linky réunira marketplace et immobilier dans une seule app, avec
          wallet intégré, escrow Mobile Money, et un fil Découvrir vertical.
          Le service n&apos;a pas encore ouvert au public.
        </p>
      </Prose>

      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight text-[#0E1311] md:text-4xl">
        Ce qui nous tient.
      </h2>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {VALUES.map((v) => (
          <div
            key={v.n}
            className="rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1]"
          >
            <div className="font-display text-sm font-bold text-[#0e6e55]">
              {v.n}
            </div>
            <h3 className="font-display mt-2 text-xl font-bold tracking-tight">
              {v.t}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5e6864]">
              {v.d}
            </p>
          </div>
        ))}
      </div>

    </PageShell>
  );
}

import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Discover } from '@/components/landing/Discover';
import { Diaspora } from '@/components/landing/Diaspora';
import { Trust } from '@/components/landing/Trust';
import { FAQ } from '@/components/landing/FAQ';
import { CTABand } from '@/components/landing/CTABand';
import { Footer } from '@/components/landing/Footer';
import { getLatestAndroidRelease } from '@/lib/download';

export default async function Page() {
  // Lu ICI, cote serveur, puis passe aux deux boutons : une seule requete par
  // rendu au lieu d'une par emplacement, et aucun risque que l'accroche et la
  // bande d'appel affichent deux versions differentes.
  const release = await getLatestAndroidRelease();
  return (
    <main>
      <Nav />
      <Hero release={release} />
      <Features />
      <HowItWorks />
      <Discover />
      <Diaspora />
      <Trust />
      {/* Section « Avis utilisateurs » retiree le 2026-09-07. Elle citait trois
          clients nommes, notes 5 etoiles, avec des affirmations chiffrees
          (« mes ventes ont triplé », « trouvé mon appartement en 3 jours »)
          sur une application qui n'a jamais eu un seul utilisateur ni encaisse
          un seul paiement. Elle reviendra quand de vrais clients auront de
          vrais avis a donner. */}
      <FAQ />
      <CTABand release={release} />
      <Footer />
    </main>
  );
}

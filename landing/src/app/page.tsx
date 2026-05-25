import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Discover } from '@/components/landing/Discover';
import { Diaspora } from '@/components/landing/Diaspora';
import { Trust } from '@/components/landing/Trust';
import { Testimonials } from '@/components/landing/Testimonials';
import { FAQ } from '@/components/landing/FAQ';
import { CTABand } from '@/components/landing/CTABand';
import { Footer } from '@/components/landing/Footer';

export default function Page() {
  return (
    <main>
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Discover />
      <Diaspora />
      <Trust />
      <Testimonials />
      <FAQ />
      <CTABand />
      <Footer />
    </main>
  );
}

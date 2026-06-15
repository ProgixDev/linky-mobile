import { AppStoreBadges } from './AppStoreBadges';
import { AndroidDownloadButton } from './AndroidDownloadButton';

export function CTABand() {
  return (
    <section id="download" className="px-6 py-20 lg:px-10 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grain relative overflow-hidden rounded-[36px] bg-gradient-to-br from-primary via-primary-deep to-[#063929] px-8 py-16 text-white md:px-16 md:py-24">
          {/* Saffron bleed */}
          <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-accent/30 blur-3xl" />
          <div className="pointer-events-none absolute -left-32 -bottom-32 h-[420px] w-[420px] rounded-full bg-[#5FE3B4]/20 blur-3xl" />

          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <h2 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Télécharge Linky.{' '}
              <span className="text-accent">C&apos;est gratuit.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-white/80">
              Android disponible maintenant, iOS bientôt. Inscription en 1
              minute, vérification en 3. En Guinée et pour la diaspora.
            </p>

            <div className="mt-10 flex flex-col items-center gap-6">
              <AndroidDownloadButton variant="onDark" />
              <div className="flex flex-col items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
                  Bientôt sur les stores
                </span>
                <AppStoreBadges />
              </div>
            </div>

            <div className="mx-auto mt-10 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/60">
              <span>🔒 Paiement escrow sécurisé</span>
              <span>·</span>
              <span>Vendeurs vérifiés KYC</span>
              <span>·</span>
              <span>100 % français</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import Image from 'next/image';
import {
  ShieldCheck,
  Wallet,
  Compass,
  ScanFace,
  ArrowUpRight,
  Star,
} from 'lucide-react';

/**
 * Bento — five tiles, four distinct shapes. Asymmetric on purpose.
 * Replaces the uniform 6-card SaaS grid with a magazine-style layout
 * that includes real screenshots and proof numbers.
 */
export function Features() {
  return (
    <section id="comment" className="scroll-mt-20 bg-[#F7F3EC] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        {/* Heading — two-column, copy left, sub-text right */}
        <div className="grid items-end gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#5e6864] ring-1 ring-[#E5DED1]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0e6e55]" />
              Pourquoi Linky
            </div>
            <h2 className="font-display mt-5 text-[clamp(2rem,8vw,2.5rem)] font-bold leading-[1.05] tracking-tight text-[#0E1311] md:text-[56px]">
              Un seul outil.{' '}
              <span className="italic font-normal text-[#5e6864]">
                Cinq raisons d&apos;y rester.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-[#5e6864] md:justify-self-end md:text-right">
            On a passé 18 mois à parler avec acheteurs, vendeurs et agents
            guinéens. Chaque module ci-dessous résout un problème qu&apos;on a
            entendu plus de cent fois.
          </p>
        </div>

        {/* Bento */}
        <div className="mt-14 grid gap-5 lg:grid-cols-12">
          {/* HERO — Marketplace (left, tall, 2 rows) */}
          <article className="relative overflow-hidden rounded-[28px] bg-white p-6 ring-1 ring-[#E5DED1] sm:p-8 lg:col-span-7 lg:row-span-2 lg:p-10">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#0e6e55]">
                    01 · Marketplace
                  </div>
                  <h3 className="font-display mt-3 max-w-md text-3xl font-bold leading-[1.1] tracking-tight md:text-4xl">
                    Mode, électronique, maison, auto — vendeurs locaux et
                    boutiques vérifiées.
                  </h3>
                </div>
                <div className="hidden shrink-0 rounded-2xl bg-[#0e6e55] px-3 py-2 text-white sm:block">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    Catalogue
                  </div>
                  <div className="font-display text-2xl font-bold leading-none">
                    4 200+
                  </div>
                </div>
              </div>

              {/* Inline phone screenshot peek */}
              <div className="relative mt-8 flex-1 min-h-[280px]">
                <div className="absolute inset-x-0 bottom-0 top-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#EFE8DA] to-[#F7F3EC]">
                  <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
                    <div className="rounded-[28px] bg-[#0E1311] p-2 shadow-[0_24px_60px_-20px_rgba(14,19,17,0.35)]">
                      <div className="relative h-[300px] w-[200px] overflow-hidden rounded-[22px] bg-white">
                        <Image
                          src="/images/welcome-1.png"
                          alt="Marketplace Linky"
                          fill
                          className="object-cover object-top"
                          sizes="200px"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#5e6864]">
                <span className="flex items-center gap-1.5">
                  <Star size={13} fill="#e8a53d" className="text-[#e8a53d]" />
                  <strong className="font-bold text-[#0E1311]">4,8</strong>
                  &nbsp;moyenne vendeurs
                </span>
                <span className="h-1 w-1 rounded-full bg-[#D4CCBA]" />
                <span>
                  <strong className="font-bold text-[#0E1311]">17 villes</strong>{' '}
                  couvertes
                </span>
                <span className="h-1 w-1 rounded-full bg-[#D4CCBA]" />
                <span>Aucun frais de mise en ligne</span>
              </div>
            </div>
          </article>

          {/* KYC big-stat dark card */}
          <article className="rounded-[28px] bg-[#0E1311] p-6 text-white sm:p-8 lg:col-span-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#e8a53d]">
                  02 · Confiance
                </div>
                <h3 className="font-display mt-3 text-2xl font-bold leading-[1.15] tracking-tight md:text-3xl">
                  KYC en trois minutes.
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <ScanFace size={22} strokeWidth={1.75} />
              </div>
            </div>
            <div className="mt-7 flex items-baseline gap-3">
              <span className="font-display text-7xl font-bold leading-none tracking-tighter">
                ×3
              </span>
              <span className="max-w-[180px] text-sm text-white/65">
                de ventes en moyenne après obtention du badge « Vérifié »
              </span>
            </div>
            <div className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-[#e8a53d]">
              Voir le process
              <ArrowUpRight size={13} strokeWidth={2.5} />
            </div>
          </article>

          {/* Wallet — emerald gradient */}
          <article className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#118866] via-[#0A5240] to-[#063929] p-6 text-white sm:p-8 lg:col-span-5">
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[#e8a53d]/30 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-white/70">
                  03 · Wallet
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                  <Wallet size={16} />
                </div>
              </div>
              <h3 className="font-display mt-3 text-2xl font-bold leading-[1.15] tracking-tight md:text-3xl">
                Recharge, paye, retire. Sans quitter l&apos;app.
              </h3>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {['Orange Money', 'MTN', 'Visa', 'Mastercard'].map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm ring-1 ring-white/15"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </article>

          {/* Découvrir — image-rich, wider */}
          <article className="relative overflow-hidden rounded-[28px] bg-white p-6 ring-1 ring-[#E5DED1] sm:p-8 lg:col-span-7">
            <div className="grid items-center gap-8 sm:grid-cols-[1fr_140px]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#0e6e55]">
                  04 · Découvrir
                </div>
                <h3 className="font-display mt-3 text-2xl font-bold leading-[1.15] tracking-tight md:text-3xl">
                  Le marché qui se feuillette comme un fil vidéo.
                </h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#5e6864]">
                  Swipe vertical entre articles et logements. Aime, sauvegarde,
                  contacte. Conversion ×3 vs la grille classique.
                </p>
                <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#0e6e55]">
                  <Compass size={13} strokeWidth={2.25} />
                  1,2 M de vues / mois
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="relative mx-auto h-[180px] w-[120px] overflow-hidden rounded-2xl bg-[#0E1311]">
                  <Image
                    src="/images/welcome-3.png"
                    alt="Fil Découvrir"
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                    {['❤', '💬', '⤴'].map((e) => (
                      <span
                        key={e}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs text-white backdrop-blur-sm"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Escrow — soft emerald */}
          <article className="rounded-[28px] bg-[#E8F2EE] p-6 ring-1 ring-[#0e6e55]/10 sm:p-8 lg:col-span-5">
            <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-[#0A5240]">
              05 · Escrow
            </div>
            <h3 className="font-display mt-3 text-2xl font-bold leading-[1.15] tracking-tight text-[#0A5240] md:text-3xl">
              Le vendeur n&apos;est payé qu&apos;après ta confirmation.
            </h3>
            <div className="mt-6 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0e6e55] text-white">
                <ShieldCheck size={22} strokeWidth={1.75} />
              </div>
              <p className="text-[14px] leading-relaxed text-[#0A5240]/85">
                Argent gardé en séquestre. Litige en 48 h s&apos;il y a un
                problème.{' '}
                <strong className="font-bold">
                  98 % des litiges résolus à l&apos;amiable.
                </strong>
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

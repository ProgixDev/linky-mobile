'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Sparkles, Heart, MessageCircle, Bookmark } from 'lucide-react';

export function Discover() {
  const reduceMotion = useReducedMotion();
  return (
    <section
      id="decouvrir"
      className="relative scroll-mt-20 overflow-hidden bg-[#0E1311] py-20 text-white md:py-32"
    >
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute right-[-10%] bottom-0 h-[360px] w-[360px] rounded-full bg-accent/25 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20 lg:px-10">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 ring-1 ring-accent/30">
            <Sparkles size={13} className="text-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-accent">
              Découvrir
            </span>
          </div>
          <h2 className="font-display mt-5 text-[clamp(2rem,8vw,2.5rem)] font-bold leading-[1.05] tracking-tight md:text-6xl">
            Le marché qui se{' '}
            <span className="bg-gradient-to-r from-[#5FE3B4] to-accent bg-clip-text text-transparent">
              feuillette.
            </span>
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
            Swipe verticalement entre des articles et des logements. Aime,
            sauvegarde, contacte. Un fil TikTok-style pensé pour le commerce.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[
              { num: '1.2M', label: 'Vues par mois' },
              { num: '3×', label: 'Engagement vs scroll classique' },
              { num: '+30 %', label: 'Conversion pour les boutiques' },
              { num: '<2s', label: 'Temps de chargement' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/8 bg-white/[0.04] p-5"
              >
                <div className="font-display text-3xl font-bold tracking-tight">
                  {s.num}
                </div>
                <div className="mt-1.5 text-sm text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Phone mockup */}
        <div className="relative flex justify-center">
          <div className="relative w-full max-w-[300px] rounded-[42px] bg-black p-3 shadow-[0_60px_120px_-30px_rgba(0,0,0,0.6)]">
            <div className="relative aspect-[300/600] w-full overflow-hidden rounded-[32px] bg-[#0E1311]">
              <div className="absolute left-1/2 top-2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />

              {/* Hero image area */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#3A4A2E] via-[#5A6D38] to-[#8A9F5C]" />

              {/* Top filter chips */}
              <div className="absolute top-14 left-4 right-4 z-10 flex gap-2">
                <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-black">
                  Tout
                </div>
                <div className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white ring-1 ring-white/15">
                  Articles
                </div>
                <div className="rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold text-white ring-1 ring-white/15">
                  Immo
                </div>
              </div>

              {/* Right rail */}
              <div className="absolute right-3 bottom-44 z-10 flex flex-col items-center gap-3">
                {[
                  { Icon: Heart, label: '3.4k', fill: true },
                  { Icon: MessageCircle, label: '128' },
                  { Icon: Bookmark, label: '248' },
                ].map((it, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <motion.div
                      animate={
                        i === 0 && !reduceMotion
                          ? { scale: [1, 1.12, 1] }
                          : undefined
                      }
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 ring-1 ring-white/15"
                    >
                      <it.Icon
                        size={18}
                        fill={it.fill ? '#fff' : 'none'}
                        color="#fff"
                        strokeWidth={2}
                      />
                    </motion.div>
                    <span className="text-[10px] font-bold text-white">
                      {it.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-20 left-4 right-20 z-10">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-white/30" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      Maison Aïssatou
                      <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent">
                        <Sparkles size={7} color="#fff" />
                      </div>
                    </div>
                    <div className="text-[10px] text-white/60">⭐ 4.9 · Vérifié</div>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-black">
                    Suivre
                  </div>
                </div>
                <div className="mt-3 text-base font-bold leading-tight">
                  Eau de parfum édition limitée
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-xl font-bold">420 000</span>
                  <span className="text-xs font-semibold text-white/70">GNF</span>
                  <span className="text-xs text-white/50">≈ 38 €</span>
                </div>
              </div>

              {/* Dim overlay */}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

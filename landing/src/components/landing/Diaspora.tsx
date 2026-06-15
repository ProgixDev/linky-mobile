'use client';

import { motion } from 'motion/react';
import { Plane, CreditCard, Send, Home as HomeIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Use {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const USES: Use[] = [
  {
    Icon: CreditCard,
    title: 'Paye en € depuis Paris ou Bruxelles',
    body: 'Carte bancaire acceptée. Conversion EUR → GNF transparente, sans frais cachés.',
  },
  {
    Icon: Send,
    title: 'Envoie un cadeau à ta famille',
    body: 'Achète sur place, livré au quartier. Plus besoin de demander à quelqu\'un de passer.',
  },
  {
    Icon: HomeIcon,
    title: 'Prépare ton retour',
    body: 'Repère ton futur logement à Conakry, réserve une visite vidéo, fais ton offre depuis l\'étranger.',
  },
];

export function Diaspora() {
  return (
    <section
      id="diaspora"
      className="relative overflow-hidden py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
          {/* Left: visual */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
            className="relative aspect-square overflow-hidden rounded-[36px] bg-gradient-to-br from-primary via-primary-deep to-[#063929] p-7 text-white sm:p-10"
          >
            <div className="grain absolute inset-0" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                  <Plane size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Pour la diaspora
                  </span>
                </div>
                <h3 className="font-display mt-6 text-[40px] font-bold leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
                  Reste connecté{' '}
                  <span className="text-accent">au pays.</span>
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { num: '+15k', label: 'Diaspora utilisateurs' },
                  { num: '12', label: 'Pays supportés' },
                  { num: '24/7', label: 'Support FR' },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="font-display text-2xl font-bold">{s.num}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-white/65">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: features */}
          <div>
            <div className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              Diaspora
            </div>
            <h2 className="font-display mt-5 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
              Depuis Paris, Bruxelles ou Washington — comme si tu étais à Conakry.
            </h2>

            <div className="mt-10 space-y-7">
              {USES.map((u, i) => (
                <motion.div
                  key={u.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex gap-5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft">
                    <u.Icon size={22} className="text-primary" strokeWidth={1.75} />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold tracking-tight">
                      {u.title}
                    </h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                      {u.body}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

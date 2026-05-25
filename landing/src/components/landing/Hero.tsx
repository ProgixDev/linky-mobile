'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ShieldCheck, Wallet, Sparkles } from 'lucide-react';
import { AppStoreBadges } from './AppStoreBadges';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 md:pt-32 md:pb-28">
      {/* Background mesh */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-20 h-[420px] w-[420px] rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute right-[-10%] top-32 h-[360px] w-[360px] rounded-full bg-accent/18 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-10">
        {/* Left: copy */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1.5"
          >
            <Sparkles size={13} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary-deep">
              Nouveau · disponible en Guinée
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display mt-5 text-[44px] font-bold leading-[1.05] tracking-tight md:text-[60px]"
          >
            Le marché et l&apos;immobilier{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              en Guinée
            </span>
            , dans une seule app.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-text-muted"
          >
            Achète, vends ou trouve un logement. Paiement Mobile Money sécurisé
            par escrow, vendeurs vérifiés, et un fil Découvrir pour repérer les
            pépites.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <AppStoreBadges />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-text-muted"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-primary" />
              <span>Paiement escrow</span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-primary" />
              <span>Orange Money, MTN, carte bancaire</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-primary" />
              <span>Vendeurs KYC vérifiés</span>
            </div>
          </motion.div>
        </div>

        {/* Right: phone mockup */}
        <div className="relative flex items-center justify-center">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

function PhoneMockup() {
  return (
    <div className="relative">
      {/* Floating chips */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, x: -10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="absolute -left-8 top-16 z-20 rounded-2xl bg-card p-3 shadow-[var(--shadow-pop)] ring-1 ring-border md:-left-14"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-xs font-bold">Paiement sécurisé</div>
            <div className="text-[10px] text-text-muted">Escrow Mobile Money</div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, x: 10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="absolute -right-6 bottom-16 z-20 rounded-2xl bg-card p-3 shadow-[var(--shadow-pop)] ring-1 ring-border md:-right-10"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-text">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="text-xs font-bold">+30 % de visibilité</div>
            <div className="text-[10px] text-text-muted">Avec un boost</div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="relative mx-auto"
      >
        <div className="relative rounded-[42px] bg-[#0E1311] p-3 shadow-[0_30px_60px_-15px_rgba(14,19,17,0.35)]">
          <div className="relative h-[600px] w-[300px] overflow-hidden rounded-[32px] bg-bg">
            {/* Notch */}
            <div className="absolute left-1/2 top-2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-[#0E1311]" />

            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-6 pt-12 text-[11px] font-semibold">
                <span>9:41</span>
                <span className="opacity-70">●●●●● 􀙫</span>
              </div>

              {/* Mock screen content */}
              <div className="flex-1 px-5 pb-4 pt-4">
                {/* Greeting */}
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-full bg-bg-sunken" />
                  <div>
                    <div className="text-[10px] text-text-muted">Bonjour,</div>
                    <div className="text-sm font-bold">Mariama</div>
                  </div>
                </div>

                {/* Wallet card */}
                <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#118866] via-[#0A5240] to-[#063929] p-4 text-white">
                  <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">
                    Solde Linky
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold">850 000</span>
                    <span className="text-xs opacity-70">GNF</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-full bg-white py-2 text-center text-[11px] font-bold text-[#0A5240]">
                      Recharger
                    </div>
                    <div className="flex-1 rounded-full bg-white/15 py-2 text-center text-[11px] font-semibold">
                      Retirer
                    </div>
                  </div>
                </div>

                {/* Categories preview */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {[
                    { c: '#E8F2EE', t: 'Mode' },
                    { c: '#FCF1DC', t: 'Tech' },
                    { c: '#F1EAD9', t: 'Maison' },
                    { c: '#E4ECF6', t: 'Auto' },
                  ].map((cat) => (
                    <div key={cat.t} className="flex flex-col items-center gap-1">
                      <div
                        className="h-12 w-full rounded-xl"
                        style={{ background: cat.c }}
                      />
                      <span className="text-[9px] font-semibold">{cat.t}</span>
                    </div>
                  ))}
                </div>

                {/* Product row */}
                <div className="mt-4 space-y-2">
                  {[
                    { t: 'iPhone 12 Pro', p: '4.8M GNF' },
                    { t: 'Robe wax', p: '185k GNF' },
                  ].map((it) => (
                    <div
                      key={it.t}
                      className="flex items-center gap-2 rounded-xl bg-bg-elev p-2 ring-1 ring-border"
                    >
                      <div className="h-10 w-10 rounded-lg bg-bg-sunken" />
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold">{it.t}</div>
                        <div className="text-[10px] font-bold">{it.p}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex h-16 border-t border-border bg-bg-elev pt-2">
                {['Accueil', 'Marché', '', 'Boutique', 'Profil'].map((l, i) => (
                  <div
                    key={i}
                    className="relative flex flex-1 flex-col items-center justify-start gap-1"
                  >
                    {i === 2 ? (
                      <div className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(14,110,85,0.4)]">
                        <Sparkles size={16} />
                      </div>
                    ) : (
                      <div className="mt-2 h-4 w-4 rounded bg-text-faint/30" />
                    )}
                    <span className="text-[8px] text-text-faint">
                      {l || 'Découvrir'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

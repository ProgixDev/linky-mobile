'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ShieldCheck, Wallet, Sparkles } from 'lucide-react';
import { AndroidDownloadButton } from './AndroidDownloadButton';
import { AppStoreBadges } from './AppStoreBadges';
import { ANDROID_APK_PATH, DRIVER_APK_PATH } from '@/lib/download';

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Full-bleed background */}
      <Image
        src="/images/hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        style={{ zIndex: 0 }}
      />
      {/* Readability gradient.
          On phones the copy spans the full width, so a left→right fade leaves
          the right edge of the text sitting on a bright image. We stack a
          vertical bottom-up wash (mobile-friendly) under the horizontal fade
          so copy stays legible at every breakpoint. */}
      <div
        className="pointer-events-none absolute inset-0 md:hidden"
        style={{
          zIndex: 1,
          background:
            'linear-gradient(to bottom, rgba(247,243,236,0.92) 0%, rgba(247,243,236,0.82) 45%, rgba(247,243,236,0.55) 75%, rgba(247,243,236,0.25) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          zIndex: 1,
          background:
            'linear-gradient(to right, rgba(247,243,236,0.85) 0%, rgba(247,243,236,0.55) 35%, rgba(247,243,236,0.15) 65%, rgba(247,243,236,0) 100%)',
        }}
      />

      <div
        className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-5 pt-28 pb-20 sm:px-6 lg:px-10"
        style={{ zIndex: 2 }}
      >
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#0e6e55]/25 bg-[#E8F2EE] px-3 py-1.5 backdrop-blur-sm"
          >
            <Sparkles size={13} className="text-[#0e6e55]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#0A5240]">
              Nouveau · disponible en Guinée
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-display mt-6 text-[clamp(2.25rem,9vw,2.75rem)] font-bold leading-[1.04] tracking-tight text-[#0E1311] sm:text-5xl md:text-[68px] md:leading-[1.02]"
          >
            Le marché et{' '}
            <span className="bg-gradient-to-r from-[#0e6e55] to-[#e8a53d] bg-clip-text text-transparent">
              l&apos;immobilier
            </span>{' '}
            en Guinée.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-[#1E2825]"
          >
            Achète, vends ou trouve un logement. Paiement Mobile Money sécurisé
            par escrow, vendeurs vérifiés, et un fil Découvrir pour repérer les
            pépites.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-10 flex flex-col items-start gap-5"
          >
            <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
              <AndroidDownloadButton
                href={ANDROID_APK_PATH}
                fileName="linky.apk"
                kicker="Télécharger · Gratuit"
                title="Linky"
                variant="primary"
              />
              <AndroidDownloadButton
                href={DRIVER_APK_PATH}
                fileName="linky-driver.apk"
                kicker="App livreur"
                title="Linky Driver"
                variant="secondary"
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#1E2825]/45">
                Bientôt aussi sur
              </span>
              <AppStoreBadges variant="dark" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm font-medium text-[#1E2825]/80"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-[#0e6e55]" />
              <span>Paiement escrow</span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-[#0e6e55]" />
              <span>Orange Money, MTN, carte bancaire</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-[#0e6e55]" />
              <span>Vendeurs KYC vérifiés</span>
            </div>
          </motion.div>
        </div>

      </div>
    </section>
  );
}

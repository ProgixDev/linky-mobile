'use client';

import { useState } from 'react';
import {
  Search,
  CreditCard,
  PackageCheck,
  Camera,
  Megaphone,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Audience = 'buyer' | 'seller';

interface Step {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: Record<Audience, Step[]> = {
  buyer: [
    {
      Icon: Search,
      title: 'Trouve ce qu\'il te faut',
      body: 'Cherche un produit ou un logement, filtre par ville, prix, état.',
    },
    {
      Icon: CreditCard,
      title: 'Paie en toute sécurité',
      body: 'Orange Money, MTN, carte bancaire ou wallet Linky. Escrow inclus.',
    },
    {
      Icon: PackageCheck,
      title: 'Reçois et confirme',
      body: 'Tu valides la réception. Le vendeur est payé. Sinon, on arbitre.',
    },
  ],
  seller: [
    {
      Icon: Camera,
      title: 'Publie en 2 minutes',
      body: 'Photos, prix, lieu. Annonce visible dans tout le pays.',
    },
    {
      Icon: Megaphone,
      title: 'Booste tes ventes',
      body: 'Mets en avant tes annonces pour 3× plus de vues sur 7 jours.',
    },
    {
      Icon: Wallet,
      title: 'Encaisse rapide',
      body: 'Versements Mobile Money dans les 48 h après confirmation.',
    },
  ],
};

export function HowItWorks() {
  const [audience, setAudience] = useState<Audience>('buyer');
  const steps = STEPS[audience];

  return (
    <section className="py-20 md:py-28" id="how">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center rounded-full border border-border bg-bg-elev px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
            Comment ça marche
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            3 étapes, peu importe le côté.
          </h2>
        </div>

        {/* Audience switcher */}
        <div className="mx-auto mt-10 flex w-fit gap-1 rounded-full bg-bg-elev p-1.5 ring-1 ring-border">
          {(['buyer', 'seller'] as const).map((a) => {
            const active = audience === a;
            return (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`rounded-full px-6 py-2.5 text-sm font-bold transition-all ${
                  active
                    ? 'bg-text text-bg'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {a === 'buyer' ? 'Je suis acheteur' : 'Je vends'}
              </button>
            );
          })}
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative">
              {/* Step number */}
              <div className="font-display text-[80px] font-bold leading-none tracking-tighter text-primary-soft">
                0{i + 1}
              </div>
              <div className="-mt-12 ml-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_8px_22px_-6px_rgba(15,114,86,0.5)]">
                <s.Icon size={24} strokeWidth={1.75} />
              </div>
              <h3 className="font-display mt-6 text-xl font-bold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

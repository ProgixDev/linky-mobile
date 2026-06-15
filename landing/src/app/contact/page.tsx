import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Une question, un partenariat, un signalement ? Voici comment nous joindre.',
};

const CHANNELS = [
  {
    t: 'Support utilisateurs',
    d: 'Pour acheteurs et vendeurs. Réponse < 1 h en semaine.',
    addr: 'support@linky.gn',
    tag: 'support',
  },
  {
    t: 'Partenariats commerciaux',
    d: 'Distribution, intégrations, presse commerciale.',
    addr: 'partners@linky.gn',
    tag: 'business',
  },
  {
    t: 'Sécurité & signalements',
    d: 'Faille, compte piraté, contenu illicite.',
    addr: 'security@linky.gn',
    tag: 'security',
  },
  {
    t: 'Presse & médias',
    d: 'Demandes presse, kit, interviews.',
    addr: 'press@linky.gn',
    tag: 'press',
  },
];

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="On t'écoute."
      subtitle="Quatre canaux selon la nature de ta demande, plus un numéro direct pour les urgences."
    >
      {/* Phone + chat hero */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-7 ring-1 ring-[#E5DED1]">
          <div className="text-xs font-bold uppercase tracking-wider text-[#0e6e55]">
            Téléphone · 9 h – 21 h
          </div>
          <div className="font-display mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
            +224 622 00 00 00
          </div>
          <p className="mt-2 text-sm text-[#5e6864]">
            En français · 7 jours sur 7.
          </p>
        </div>
        <div className="rounded-3xl bg-[#0E1311] p-7 text-white">
          <div className="text-xs font-bold uppercase tracking-wider text-[#e8a53d]">
            Chat en direct
          </div>
          <div className="font-display mt-2 text-3xl font-bold tracking-tight">
            Disponible dans l&apos;app
          </div>
          <p className="mt-2 text-sm text-white/65">
            Ouvre l&apos;app Linky → Profil → Aide & support.
          </p>
        </div>
      </div>

      {/* Channels */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Par email — selon ta demande.
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {CHANNELS.map((c) => (
          <a
            key={c.tag}
            href={`mailto:${c.addr}`}
            className="block rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(14,19,17,0.15)]"
          >
            <h3 className="font-display text-lg font-bold tracking-tight">
              {c.t}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#5e6864]">
              {c.d}
            </p>
            <div className="mt-4 inline-block rounded-full bg-[#EFE8DA] px-3 py-1 text-xs font-bold text-[#0E1311]">
              {c.addr}
            </div>
          </a>
        ))}
      </div>

      {/* Mailing address */}
      <h2 className="font-display mt-16 text-3xl font-bold tracking-tight md:text-4xl">
        Bureau.
      </h2>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1] md:p-7">
        <div className="font-bold">Linky SAS</div>
        <p className="mt-1 text-sm leading-relaxed text-[#5e6864]">
          Immeuble Kaloum Tower, 12<sup>ème</sup> étage
          <br />
          Avenue de la République
          <br />
          Conakry, Guinée
        </p>
      </div>
    </PageShell>
  );
}

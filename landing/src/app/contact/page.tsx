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
    d: 'Pour acheteurs et vendeurs.',
    addr: 'support@linkygroup.com',
    tag: 'support',
  },
  {
    t: 'Partenariats commerciaux',
    d: 'Distribution, intégrations, presse commerciale.',
    addr: 'partners@linkygroup.com',
    tag: 'business',
  },
  {
    t: 'Sécurité & signalements',
    d: 'Faille, compte piraté, contenu illicite.',
    addr: 'security@linkygroup.com',
    tag: 'security',
  },
  {
    t: 'Presse & médias',
    d: 'Demandes presse, kit, interviews.',
    addr: 'press@linkygroup.com',
    tag: 'press',
  },
];

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="On t'écoute."
      subtitle="Quatre canaux selon la nature de ta demande."
    >
      {/* Phone + chat hero */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-[#0E1311] p-7 text-white">
          <div className="text-xs font-bold uppercase tracking-wider text-[#e8a53d]">
            Aide dans l&apos;app
          </div>
          <div className="font-display mt-2 text-3xl font-bold tracking-tight">
            Écris-nous
          </div>
          <p className="mt-2 text-sm text-white/65">
            Ouvre l&apos;app Linky → Profil → Aide & support.
          </p>
        </div>

        {/* Téléphone + WhatsApp (client 2026-09-08). La grille prévoyait deux
            colonnes depuis toujours — le commentaire au-dessus dit « Phone +
            chat hero » — mais la seconde était vide, faute de numéro réel. */}
        <div className="rounded-3xl bg-white p-7 ring-1 ring-[#E5DED1]">
          <div className="text-xs font-bold uppercase tracking-wider text-[#8a9490]">
            Par téléphone
          </div>
          <div className="font-display mt-2 text-3xl font-bold tracking-tight">
            Appelle-nous
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#5e6864]">
            Appel direct ou WhatsApp, du lundi au samedi.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href="tel:+224610574736"
              className="rounded-full bg-[#0E1311] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              +224 610 57 47 36
            </a>
            <a
              href="https://wa.me/224610574736"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#EFE8DA] px-4 py-2 text-sm font-bold text-[#0E1311] transition-colors hover:bg-[#E5DED1]"
            >
              WhatsApp
            </a>
          </div>
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

    </PageShell>
  );
}

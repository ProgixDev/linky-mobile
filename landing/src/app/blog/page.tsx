import type { Metadata } from 'next';
import { PageShell } from '@/components/landing/PageShell';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Actualités produit, histoires de vendeurs, et conseils Linky.',
};

interface Post {
  slug: string;
  title: string;
  excerpt: string;
  category: 'Produit' | 'Histoires' | 'Guides' | 'Sécurité';
  date: string;
  read: string;
}

const POSTS: Post[] = [
  {
    slug: 'linky-arrive-en-guinee',
    title: 'Linky arrive en Guinée',
    excerpt:
      'Marketplace et immobilier, paiement Mobile Money protégé par séquestre, vendeurs vérifiés : voilà ce qu\'on prépare pour le lancement.',
    category: 'Produit',
    date: '12 mai 2026',
    read: '4 min',
  },
  {
    slug: 'guide-premiere-vente',
    title: 'Ta première vente sur Linky en 5 étapes',
    excerpt:
      'Photos, prix, description, paiement, livraison — un guide pas-à-pas pour publier ta première annonce et la vendre.',
    category: 'Guides',
    date: '3 mai 2026',
    read: '8 min',
  },
  {
    slug: 'escrow-explique',
    title: 'Comment marche l\'escrow Mobile Money ?',
    excerpt:
      'On t\'explique pourquoi ton paiement est gardé en séquestre et comment on libère les fonds au vendeur après ta confirmation.',
    category: 'Sécurité',
    date: '25 avril 2026',
    read: '5 min',
  },
  {
    slug: 'decouvrir-fil-vertical',
    title: 'Pourquoi on a fait Découvrir en vertical',
    excerpt:
      'Pourquoi un fil TikTok-style fait sens pour un marché et comment on a évité la dérive « contenu sans contexte ».',
    category: 'Produit',
    date: '17 avril 2026',
    read: '7 min',
  },
];

const CATEGORY_TINT: Record<Post['category'], { bg: string; fg: string }> = {
  Produit: { bg: '#E8F2EE', fg: '#0A5240' },
  Histoires: { bg: '#FCF1DC', fg: '#8B5A0A' },
  Guides: { bg: '#E4ECF6', fg: '#2F5BBE' },
  Sécurité: { bg: '#FBE7E5', fg: '#B53D2F' },
};

export default function BlogPage() {
  const [hero, ...rest] = POSTS;
  return (
    <PageShell
      eyebrow="Le journal"
      title="Lectures Linky."
      subtitle="On y partage des nouveautés produit, des histoires de notre communauté, et des conseils pratiques pour acheter ou vendre."
    >
      {/* Hero post */}
      {hero && (
        <a
          href={`/blog/${hero.slug}`}
          className="block overflow-hidden rounded-3xl bg-white ring-1 ring-[#E5DED1] transition-shadow hover:shadow-[0_24px_60px_-20px_rgba(14,19,17,0.18)]"
        >
          <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
            <div className="aspect-[4/3] bg-gradient-to-br from-[#0e6e55] via-[#0A5240] to-[#063929] md:aspect-auto" />
            <div className="p-8 md:p-10">
              <CategoryChip category={hero.category} />
              <h2 className="font-display mt-4 text-2xl font-bold tracking-tight text-[#0E1311] md:text-3xl">
                {hero.title}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#5e6864]">
                {hero.excerpt}
              </p>
              <div className="mt-5 text-xs font-medium text-[#8C9590]">
                {hero.date} · {hero.read} de lecture
              </div>
            </div>
          </div>
        </a>
      )}

      {/* Grid */}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {rest.map((p) => (
          <a
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="group block rounded-2xl bg-white p-6 ring-1 ring-[#E5DED1] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(14,19,17,0.15)]"
          >
            <CategoryChip category={p.category} />
            <h3 className="font-display mt-3 text-lg font-bold leading-tight tracking-tight">
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5e6864]">
              {p.excerpt}
            </p>
            <div className="mt-4 text-xs text-[#8C9590]">
              {p.date} · {p.read}
            </div>
          </a>
        ))}
      </div>

      <div className="mt-12 rounded-3xl bg-[#0E1311] p-8 text-white md:p-10">
        <h3 className="font-display text-2xl font-bold tracking-tight">
          Tu veux la newsletter ?
        </h3>
        <p className="mt-2 max-w-md text-sm text-white/70">
          Un email par mois, jamais plus. Nouvelles fonctionnalités, histoires
          et conseils utiles.
        </p>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            placeholder="ton@email.com"
            className="h-12 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-sm outline-none placeholder:text-white/40 focus:border-white/30"
          />
          <button
            type="button"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#0E1311] hover:opacity-90"
          >
            S&apos;inscrire
          </button>
        </form>
      </div>
    </PageShell>
  );
}

function CategoryChip({ category }: { category: Post['category'] }) {
  const t = CATEGORY_TINT[category];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: t.bg, color: t.fg }}
    >
      {category}
    </span>
  );
}

import Image from 'next/image';
import { AtSign, Hash, Send, Play } from 'lucide-react';

const LINKS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: 'Produit',
    items: [
      { label: 'Comment ça marche', href: '#comment' },
      { label: 'Découvrir', href: '#decouvrir' },
      { label: 'Pour la diaspora', href: '#diaspora' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Entreprise',
    items: [
      { label: 'À propos', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Carrières', href: '#' },
      { label: 'Presse', href: '#' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Centre d\'aide', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Statut', href: '#' },
      { label: 'Sécurité', href: '#' },
    ],
  },
  {
    title: 'Légal',
    items: [
      { label: 'Conditions générales', href: '#' },
      { label: 'Politique de confidentialité', href: '#' },
      { label: 'Mentions légales', href: '#' },
      { label: 'Cookies', href: '#' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-[#0E1311] py-16 text-white md:py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr] lg:gap-20">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary">
                <Image
                  src="/images/adaptive-icon-dark.png"
                  alt="Linky"
                  width={32}
                  height={32}
                  className="h-9 w-9 object-contain"
                />
              </div>
              <span className="font-display text-2xl font-bold tracking-tight">
                Linky
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">
              Le marché et l&apos;immobilier en Guinée, dans une seule app.
              Construit avec amour à Conakry.
            </p>

            <div className="mt-7 flex gap-2">
              {[AtSign, Hash, Send, Play].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition-colors hover:bg-white/10"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {LINKS.map((col) => (
              <div key={col.title}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-white/45">
                  {col.title}
                </h4>
                <ul className="mt-5 space-y-3">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        className="text-sm text-white/80 transition-colors hover:text-white"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/45 md:flex-row md:items-center">
          <div>© 2026 Linky SAS. Tous droits réservés.</div>
          <div className="flex items-center gap-1.5">
            <span>Fait avec</span>
            <span className="text-danger">♥</span>
            <span>à Conakry.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

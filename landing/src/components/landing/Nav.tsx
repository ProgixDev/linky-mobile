'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '#comment', label: 'Comment ça marche' },
  { href: '#decouvrir', label: 'Découvrir' },
  { href: '#diaspora', label: 'Diaspora' },
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all ${
        scrolled
          ? 'border-b border-border/60 bg-bg/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <a href="#" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <Image
              src="/images/adaptive-icon-dark.png"
              alt="Linky"
              width={32}
              height={32}
              className="h-7 w-7 object-contain"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Linky
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-elev hover:text-text"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <a
            href="#download"
            className="inline-flex h-10 items-center rounded-full bg-text px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
          >
            Télécharger
          </a>
        </div>

        <button
          aria-label="Menu"
          onClick={() => setOpen((s) => !s)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-elev md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-bg-elev md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-bg hover:text-text"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#download"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-text px-5 text-sm font-semibold text-bg"
            >
              Télécharger l'app
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

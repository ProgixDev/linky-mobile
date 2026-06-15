'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '@/stores/auth';

export function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useAuth((s) => s.session);
  const hydrated = useAuth((s) => s.hydrated);
  const hydrate = useAuth((s) => s.hydrate);
  // Mobile nav drawer (below lg). Closed by default; opened via the hamburger
  // in the mobile header, closed on backdrop tap, link tap, or route change.
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer whenever the route changes (defence-in-depth alongside
  // the per-link onNavigate, e.g. for programmatic navigations).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Hydrate from localStorage exactly once on mount. Before this fires the
  // store reports session=null and hydrated=false, which lets us show a
  // neutral placeholder instead of flashing the redirect or the authed UI.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session || !session.isAdmin) {
      if (pathname !== '/login') router.replace('/login');
    }
  }, [hydrated, session, pathname, router]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-sunken">
        <div className="text-sm text-muted">Vérification…</div>
      </div>
    );
  }

  if (!session || !session.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-sunken">
        <div className="text-sm text-muted">Redirection…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-sunken">
      {/* Desktop fixed rail (hidden < lg) */}
      <Sidebar />

      {/* Mobile slide-in drawer + backdrop (lg:hidden) */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] border-r border-line shadow-[var(--shadow-pop)]">
            <Sidebar drawer onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header (hidden ≥ lg) — carries the hamburger + page title */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Ouvrir le menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:bg-sunken"
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold tracking-tight">
              {title}
            </h1>
          </div>
        </header>

        {/* Desktop topbar (hidden < lg) */}
        <Topbar title={title} subtitle={subtitle} />

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

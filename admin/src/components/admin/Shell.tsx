'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    if (!session && pathname !== '/login') {
      router.replace('/login');
    }
  }, [session, pathname, router]);

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-sunken">
        <div className="text-sm text-text-muted">Redirection…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-sunken">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}

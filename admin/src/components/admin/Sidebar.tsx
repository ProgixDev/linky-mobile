'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ListChecks,
  ShoppingBag,
  ShieldCheck,
  Megaphone,
  Settings,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/stores/auth';

interface Item {
  href: string;
  label: string;
  Icon: LucideIcon;
  badge?: string;
}

const NAV: { section: string; items: Item[] }[] = [
  {
    section: 'Opérations',
    items: [
      { href: '/', label: "Vue d'ensemble", Icon: LayoutDashboard },
      { href: '/users', label: 'Utilisateurs', Icon: Users },
      { href: '/listings', label: 'Annonces', Icon: ListChecks, badge: '3' },
      { href: '/orders', label: 'Commandes & litiges', Icon: ShoppingBag, badge: '6' },
      { href: '/kyc', label: 'KYC en attente', Icon: ShieldCheck, badge: '12' },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { href: '/banners', label: 'Bannières', Icon: Megaphone },
      { href: '/push', label: 'Push notifications', Icon: Megaphone },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);

  return (
    <aside className="hidden h-screen w-72 shrink-0 flex-col border-r border-border bg-bg-elev px-4 py-5 lg:flex">
      <div className="flex items-center gap-2.5 px-3 pb-5">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-primary">
          <Image
            src="/images/adaptive-icon-dark.png"
            alt="Linky"
            width={36}
            height={36}
            className="h-8 w-8 object-contain"
          />
        </div>
        <div>
          <div className="font-display text-base font-bold">Linky</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-faint">
            Admin
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto">
        {NAV.map((sec) => (
          <div key={sec.section}>
            <div className="px-3 text-[10px] font-bold uppercase tracking-[1px] text-text-faint">
              {sec.section}
            </div>
            <div className="mt-2 space-y-0.5">
              {sec.items.map((it) => {
                const active =
                  it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary-soft text-primary-deep'
                        : 'text-text-muted hover:bg-bg-sunken hover:text-text'
                    }`}
                  >
                    <it.Icon size={16} strokeWidth={1.75} />
                    <span className="flex-1">{it.label}</span>
                    {it.badge && (
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                          active
                            ? 'bg-primary text-white'
                            : 'bg-accent-soft text-accent-text'
                        }`}
                      >
                        {it.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: user + sign out */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-sunken text-sm font-bold text-text">
            {(session?.name ?? 'A').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-bold text-text">
              {session?.name ?? 'Admin'}
            </div>
            <div className="truncate text-[11px] text-text-muted">
              {session?.email ?? '—'}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Se déconnecter"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-sunken hover:text-danger"
          >
            <LogOut size={15} />
          </button>
        </div>
        <Link
          href="/settings"
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-bg-sunken"
        >
          <Settings size={13} />
          Paramètres
        </Link>
      </div>
    </aside>
  );
}

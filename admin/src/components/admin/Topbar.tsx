'use client';

import { Bell, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/stores/auth';

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const session = useAuth((s) => s.session);
  const env = session?.env ?? 'staging';

  return (
    <header className="flex h-20 shrink-0 items-center justify-between gap-6 border-b border-border bg-bg-elev px-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider ${
              env === 'production'
                ? 'bg-danger/12 text-danger'
                : 'bg-accent-soft text-accent-text'
            }`}
          >
            <ShieldCheck size={11} />
            {env}
          </span>
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden h-10 items-center gap-2 rounded-full border border-border bg-bg-sunken px-4 md:flex md:w-72">
          <Search size={15} className="text-text-muted" />
          <input
            placeholder="Rechercher utilisateur, commande, annonce…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
          />
          <kbd className="text-[10px] font-bold text-text-faint">⌘K</kbd>
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg-sunken">
          <Bell size={16} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-bg-elev" />
        </button>
      </div>
    </header>
  );
}

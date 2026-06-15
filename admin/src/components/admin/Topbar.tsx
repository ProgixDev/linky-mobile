'use client';

import { ShieldCheck } from 'lucide-react';

// Env badge is now driven by NEXT_PUBLIC_ADMIN_ENV (set in .env.local).
// Defaults to 'staging' when the var is unset; only literal 'production'
// flips the badge to the danger tint.
const ENV_RAW = (process.env.NEXT_PUBLIC_ADMIN_ENV ?? 'staging').toLowerCase();
const ENV: 'production' | 'staging' = ENV_RAW === 'production' ? 'production' : 'staging';

export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between gap-6 border-b border-line bg-surface px-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <span
            className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wider ${
              ENV === 'production'
                ? 'bg-danger/12 text-danger'
                : 'bg-accent-soft text-accent-text'
            }`}
          >
            <ShieldCheck size={11} />
            {ENV}
          </span>
        </div>
        {subtitle && (
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

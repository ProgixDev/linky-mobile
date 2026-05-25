import { Apple } from 'lucide-react';

function PlayIcon({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M3 2.5v19c0 .7.8 1.1 1.4.7l13-9.5c.5-.4.5-1.1 0-1.5l-13-9.5C3.8 1.4 3 1.8 3 2.5z" />
    </svg>
  );
}

export function AppStoreBadges({ dark = false }: { dark?: boolean }) {
  const bg = dark ? 'bg-text text-bg' : 'bg-text text-bg';
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href="#"
        className={`inline-flex h-14 items-center gap-3 rounded-2xl px-5 transition-opacity hover:opacity-90 ${bg}`}
      >
        <Apple size={26} fill="currentColor" />
        <div className="text-left leading-tight">
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            Disponible sur
          </div>
          <div className="font-semibold">App Store</div>
        </div>
      </a>
      <a
        href="#"
        className={`inline-flex h-14 items-center gap-3 rounded-2xl px-5 transition-opacity hover:opacity-90 ${bg}`}
      >
        <PlayIcon size={22} />
        <div className="text-left leading-tight">
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            Disponible sur
          </div>
          <div className="font-semibold">Google Play</div>
        </div>
      </a>
    </div>
  );
}

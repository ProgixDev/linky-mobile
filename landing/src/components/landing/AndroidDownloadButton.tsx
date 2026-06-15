'use client';

import { Download } from 'lucide-react';
import { ANDROID_APK_PATH } from '@/lib/download';

/**
 * Real, working Android APK download. Mirrors the store-badge shape so it sits
 * naturally next to the (still-disabled) App Store / Google Play badges, but is
 * a live link — the EAS artifact serves the .apk as application/octet-stream,
 * so the browser downloads it on click.
 *
 * variant:
 *   - "primary": filled green, for light backgrounds (Hero).
 *   - "onDark":  white pill, for the dark CTA band.
 */
export function AndroidDownloadButton({
  variant = 'primary',
  className = '',
}: {
  variant?: 'primary' | 'onDark';
  className?: string;
}) {
  const primary = variant === 'primary';

  return (
    <a
      href={ANDROID_APK_PATH}
      download="linky.apk"
      aria-label="Télécharger l'application Android (APK)"
      className={[
        'group inline-flex h-14 items-center gap-3 rounded-2xl pl-4 pr-6 transition-all duration-200',
        'hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        primary
          ? 'bg-[#0A5240] text-white shadow-[0_8px_24px_-8px_rgba(10,82,64,0.6)] hover:bg-[#0e6e55] hover:shadow-[0_12px_28px_-8px_rgba(10,82,64,0.7)] focus-visible:outline-[#0A5240]'
          : 'bg-white text-[#0E1311] shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] hover:bg-white focus-visible:outline-white',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
          primary ? 'bg-white/15 text-white' : 'bg-[#0A5240]/10 text-[#0A5240]',
        ].join(' ')}
      >
        <Download size={18} strokeWidth={2.25} />
      </span>
      <span className="flex flex-col items-start leading-none">
        <span
          className={[
            'text-[10px] font-semibold uppercase tracking-[0.08em]',
            primary ? 'text-white/70' : 'text-[#0E1311]/55',
          ].join(' ')}
        >
          Télécharger maintenant
        </span>
        <span className="mt-1 text-[16px] font-bold">Application Android</span>
      </span>
    </a>
  );
}

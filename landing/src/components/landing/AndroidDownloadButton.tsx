'use client';

import { ANDROID_APK_PATH } from '@/lib/download';

/** Recognizable Android robot glyph (FontAwesome brand path). */
function AndroidRobot({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 576 512"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M420.55 301.93a24 24 0 1 1 24-24 24 24 0 0 1-24 24m-265.1 0a24 24 0 1 1 24-24 24 24 0 0 1-24 24m273.7-144.48 47.94-83a10 10 0 1 0-17.27-10l-48.54 84.07a301.25 301.25 0 0 0-246.56 0L116.18 64.45a10 10 0 1 0-17.27 10l47.94 83C64.53 202.22 8.24 285.55 0 384h576c-8.24-98.45-64.54-181.78-146.85-226.55" />
    </svg>
  );
}

/**
 * Primary download CTA — a real, working APK download (links to the same-origin
 * /linky.apk, which serves the file with filename "linky.apk"). Styled as a bold
 * ink button with the Android robot in Android-green + an "APK" chip, so it reads
 * clearly as the live Android download and stands apart from the muted, disabled
 * "Bientôt" store badges.
 *
 * variant: "primary" (ink, for light backgrounds) | "onDark" (white, for the CTA band)
 */
export function AndroidDownloadButton({
  variant = 'primary',
  className = '',
}: {
  variant?: 'primary' | 'onDark';
  className?: string;
}) {
  const onDark = variant === 'onDark';

  return (
    <a
      href={ANDROID_APK_PATH}
      download="linky.apk"
      aria-label="Télécharger l'application Android (fichier APK)"
      className={[
        'group inline-flex h-15 items-center gap-3.5 rounded-2xl px-5 transition-all duration-200',
        'hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2',
        onDark
          ? 'bg-white text-[#0E1311] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.55)] hover:bg-white/95 focus-visible:outline-white'
          : 'bg-[#0E1311] text-white shadow-[0_14px_34px_-12px_rgba(14,19,17,0.75)] hover:bg-[#1b2420] focus-visible:outline-[#0E1311]',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
          onDark ? 'bg-[#3DDC84]/15' : 'bg-[#3DDC84]/20',
        ].join(' ')}
      >
        <AndroidRobot size={24} className="text-[#3DDC84]" />
      </span>
      <span className="flex flex-col items-start leading-none">
        <span
          className={[
            'text-[10.5px] font-semibold uppercase tracking-widest',
            onDark ? 'text-[#0E1311]/70' : 'text-white/85',
          ].join(' ')}
        >
          Télécharger · Gratuit
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[17px] font-bold">
          Pour Android
          <span
            className={[
              'rounded-md px-1.5 py-px text-[10px] font-extrabold tracking-wide',
              onDark ? 'bg-[#0E1311]/8 text-[#0E1311]/70' : 'bg-[#3DDC84]/20 text-[#3DDC84]',
            ].join(' ')}
          >
            APK
          </span>
        </span>
      </span>
    </a>
  );
}

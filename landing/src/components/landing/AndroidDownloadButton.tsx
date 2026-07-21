'use client';

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
 * Android APK download CTA — a real, working download (same-origin /linky.apk or
 * /linky-driver.apk). Reusable for both apps.
 *
 * variant:
 *  - "primary"   : filled brand green — the main app CTA (clear, prominent)
 *  - "secondary" : green outline — the companion driver app
 *  - "onDark"    : white — for use on the dark CTA band
 */
export function AndroidDownloadButton({
  href,
  fileName,
  kicker,
  title,
  variant = 'primary',
  className = '',
}: {
  href: string;
  fileName: string;
  kicker: string;
  title: string;
  variant?: 'primary' | 'secondary' | 'onDark' | 'onDarkGhost';
  className?: string;
}) {
  const shell = {
    primary:
      'bg-[#0A5240] text-white shadow-[0_16px_36px_-14px_rgba(10,82,64,0.7)] hover:bg-[#0c6349] focus-visible:outline-[#0A5240]',
    secondary:
      'bg-white text-[#0A5240] ring-2 ring-inset ring-[#0A5240]/30 shadow-[0_10px_28px_-16px_rgba(10,82,64,0.5)] hover:ring-[#0A5240]/60 hover:bg-[#0A5240]/[0.04] focus-visible:outline-[#0A5240]',
    onDark:
      'bg-white text-[#0E1311] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.55)] hover:bg-white/95 focus-visible:outline-white',
    onDarkGhost:
      'bg-white/10 text-white ring-2 ring-inset ring-white/30 hover:bg-white/15 hover:ring-white/50 focus-visible:outline-white',
  }[variant];

  const kickerCls = {
    primary: 'text-white/85',
    secondary: 'text-[#0A5240]/60',
    onDark: 'text-[#0E1311]/70',
    onDarkGhost: 'text-white/70',
  }[variant];

  const tileCls = {
    primary: 'bg-white/15',
    secondary: 'bg-[#3DDC84]/15',
    onDark: 'bg-[#3DDC84]/15',
    onDarkGhost: 'bg-[#3DDC84]/20',
  }[variant];

  const chipCls = {
    primary: 'bg-white/15 text-white',
    secondary: 'bg-[#0A5240]/10 text-[#0A5240]',
    onDark: 'bg-[#0E1311]/8 text-[#0E1311]/70',
    onDarkGhost: 'bg-white/15 text-white',
  }[variant];

  return (
    <a
      href={href}
      download={fileName}
      aria-label={`Télécharger ${title} (fichier APK Android)`}
      className={[
        'group inline-flex h-15 items-center gap-3.5 rounded-2xl px-5 transition-all duration-200',
        'hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2',
        shell,
        className,
      ].join(' ')}
    >
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
          tileCls,
        ].join(' ')}
      >
        <AndroidRobot size={24} className="text-[#3DDC84]" />
      </span>
      <span className="flex flex-col items-start leading-none">
        <span className={['text-[10.5px] font-semibold uppercase tracking-widest', kickerCls].join(' ')}>
          {kicker}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[17px] font-bold">
          {title}
          <span className={['rounded-md px-1.5 py-px text-[10px] font-extrabold tracking-wide', chipCls].join(' ')}>
            APK
          </span>
        </span>
      </span>
    </a>
  );
}

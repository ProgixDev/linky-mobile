/**
 * App Store + Google Play badges with real brand SVGs.
 * Inline styles + currentColor so the text/icons are guaranteed visible
 * regardless of any Tailwind utility quirks.
 */

function AppleLogo({ size = 26 }: { size?: number }) {
  // Official Apple bitten-apple silhouette (single-color).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function PlayLogo({ size = 22 }: { size?: number }) {
  // Google Play triangle in 4-color official palette.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden
    >
      <defs>
        <linearGradient id="pl-blue" x1="22" y1="32" x2="270" y2="280" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00C4FF" />
          <stop offset="1" stopColor="#0075FF" />
        </linearGradient>
        <linearGradient id="pl-red" x1="380" y1="382" x2="160" y2="170" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF3D44" />
          <stop offset="1" stopColor="#EA0E2D" />
        </linearGradient>
        <linearGradient id="pl-yellow" x1="376" y1="100" x2="200" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFE000" />
          <stop offset="1" stopColor="#FFBD00" />
        </linearGradient>
        <linearGradient id="pl-green" x1="60" y1="476" x2="280" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22E07A" />
          <stop offset="1" stopColor="#00A862" />
        </linearGradient>
      </defs>
      {/* Blue (top-left) */}
      <path
        d="M30 60c-6 6-10 16-10 28v336c0 12 4 22 10 28l190-196L30 60z"
        fill="url(#pl-blue)"
      />
      {/* Green (bottom) */}
      <path
        d="M30 452c8 8 22 9 38 0l225-128-73-68L30 452z"
        fill="url(#pl-green)"
      />
      {/* Yellow (right) */}
      <path
        d="M293 324l72 41c22 12 22 33 0 45l-72 41-73-69 73-58z"
        fill="url(#pl-yellow)"
      />
      {/* Red (top) */}
      <path
        d="M68 60c-16-9-30-8-38 0l220 196 73-68L68 60z"
        fill="url(#pl-red)"
      />
    </svg>
  );
}

// The stores have no Linky listing yet (launch < Sep 2026) — the badges are
// a DISABLED preview with an honest « Bientôt disponible », never '#' links.
// Swap to real store URLs at release.
export function AppStoreBadges({
  variant = 'dark',
}: {
  variant?: 'dark' | 'light';
}) {
  const isDark = variant === 'dark';
  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingLeft: 20,
    paddingRight: 22,
    borderRadius: 16,
    backgroundColor: isDark ? '#0E1311' : '#FFFFFF',
    color: isDark ? '#FFFFFF' : '#0E1311',
    boxShadow: isDark
      ? 'inset 0 0 0 1px rgba(255,255,255,0.06)'
      : 'inset 0 0 0 1px rgba(14,19,17,0.15)',
    opacity: 0.75,
    cursor: 'default',
    userSelect: 'none',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <div style={buttonStyle} title="Bientôt disponible sur l'App Store" aria-disabled>
        <AppleLogo size={28} />
        <span style={{ lineHeight: 1.1, color: 'inherit' }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.7,
              color: 'inherit',
            }}
          >
            Bientôt sur
          </span>
          <span
            style={{
              display: 'block',
              fontWeight: 700,
              fontSize: 17,
              color: 'inherit',
              marginTop: 2,
            }}
          >
            App Store
          </span>
        </span>
      </div>

      <div style={buttonStyle} title="Bientôt disponible sur Google Play" aria-disabled>
        <PlayLogo size={26} />
        <span style={{ lineHeight: 1.1, color: 'inherit' }}>
          <span
            style={{
              display: 'block',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.7,
              color: 'inherit',
            }}
          >
            Bientôt sur
          </span>
          <span
            style={{
              display: 'block',
              fontWeight: 700,
              fontSize: 17,
              color: 'inherit',
              marginTop: 2,
            }}
          >
            Google Play
          </span>
        </span>
      </div>
    </div>
  );
}

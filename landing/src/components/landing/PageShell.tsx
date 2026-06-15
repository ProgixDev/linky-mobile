import type { ReactNode } from 'react';
import { Nav } from './Nav';
import { Footer } from './Footer';

interface PageShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function PageShell({ eyebrow, title, subtitle, children }: PageShellProps) {
  return (
    <main className="min-h-screen bg-[#F7F3EC]">
      <Nav />
      <header className="relative overflow-hidden pt-32 pb-12 md:pt-40 md:pb-16">
        <div className="pointer-events-none absolute -left-32 top-20 -z-10 h-[420px] w-[420px] rounded-full bg-[#0e6e55]/12 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-32 -z-10 h-[360px] w-[360px] rounded-full bg-[#e8a53d]/18 blur-3xl" />
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-10">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#5e6864] ring-1 ring-[#E5DED1]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0e6e55]" />
              {eyebrow}
            </div>
          )}
          <h1 className="font-display mt-5 text-[clamp(2rem,8vw,2.5rem)] font-bold leading-[1.05] tracking-tight text-[#0E1311] sm:text-5xl md:text-[60px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#5e6864] sm:text-lg">
              {subtitle}
            </p>
          )}
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-5 pb-24 sm:px-6 md:pb-32 lg:px-10">
        {children}
      </section>
      <Footer />
    </main>
  );
}

// Reusable blocks for content pages -------------------------------------------

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="prose prose-neutral max-w-none text-[15.5px] leading-relaxed text-[#1E2825] [&_a]:font-semibold [&_a]:text-[#0e6e55] [&_a:hover]:underline [&_h2]:font-display [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-[#0E1311] [&_h3]:font-display [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:tracking-tight [&_h3]:text-[#0E1311] [&_p]:mt-5 [&_p]:leading-[1.75] [&_strong]:font-bold [&_strong]:text-[#0E1311] [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:leading-relaxed">
      {children}
    </div>
  );
}

export function LegalSections({
  sections,
  updated,
}: {
  updated: string;
  sections: { heading: string; body: ReactNode }[];
}) {
  return (
    <>
      <p className="mb-12 text-xs font-bold uppercase tracking-wider text-[#8C9590]">
        Dernière mise à jour · {updated}
      </p>
      <div className="space-y-12">
        {sections.map((s, i) => (
          <section key={s.heading}>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-sm font-bold tabular-nums text-[#0e6e55]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E1311] md:text-3xl">
                {s.heading}
              </h2>
            </div>
            <div className="mt-4 text-[15.5px] leading-[1.75] text-[#1E2825] [&_p+p]:mt-4 [&_strong]:font-bold [&_strong]:text-[#0E1311] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mt-4">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

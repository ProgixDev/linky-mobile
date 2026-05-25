import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

const inter = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  display: 'swap',
});

const grotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Linky Admin',
    template: '%s · Linky Admin',
  },
  description: 'Back-office Linky — opérations, KYC, litiges, KPIs.',
  robots: 'noindex,nofollow',
};

export const viewport: Viewport = {
  themeColor: '#0e6e55',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="min-h-screen bg-bg-sunken text-text font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}
